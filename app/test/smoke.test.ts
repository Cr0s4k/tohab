/**
 * Browser smoke test: drives headless Chrome over CDP against a running dev/preview server.
 * Verifies the app boots, RxDB persists across reloads, and the core flows work.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, signIn, type TestSession } from './auth.ts';

const APP = process.env.APP ?? 'http://localhost:5177';
const CHROME =
	process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;

let failures = 0;
function check(label: string, got: unknown, want: unknown) {
	const a = JSON.stringify(got);
	const b = JSON.stringify(want);
	if (a !== b) {
		failures++;
		console.log(`FAIL  ${label}\n        want ${b}\n        got  ${a}`);
	} else {
		console.log(`ok    ${label}`);
	}
}

const profile = mkdtempSync(join(tmpdir(), 'tohab-chrome-'));
const chrome = spawn(
	CHROME,
	[
		'--headless=new',
		`--remote-debugging-port=${PORT}`,
		`--user-data-dir=${profile}`,
		'--no-first-run',
		'--no-default-browser-check',
		'--disable-gpu',
		'--window-size=390,844',
		'about:blank'
	],
	{ stdio: 'ignore' }
);

async function wsUrl(): Promise<string> {
	for (let i = 0; i < 60; i++) {
		try {
			const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
			const json = (await res.json()) as { webSocketDebuggerUrl: string };
			if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error('Chrome did not expose a debugging endpoint');
}

const ws = new WebSocket(await wsUrl());
await new Promise((resolve, reject) => {
	ws.addEventListener('open', resolve, { once: true });
	ws.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const waiting = new Map<number, (v: any) => void>();
const consoleErrors: string[] = [];
let sessionId: string | undefined;

ws.addEventListener('message', (ev) => {
	const msg = JSON.parse(String(ev.data));
	if (msg.id && waiting.has(msg.id)) {
		waiting.get(msg.id)!(msg);
		waiting.delete(msg.id);
		return;
	}
	if (msg.method === 'Runtime.exceptionThrown') {
		const d = msg.params?.exceptionDetails;
		consoleErrors.push(`uncaught: ${d?.exception?.description ?? d?.text}`);
	}
	if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
		consoleErrors.push(
			`console.error: ${msg.params.args.map((a: any) => a.value ?? a.description ?? a.type).join(' ')}`
		);
	}
});

function send(method: string, params: Record<string, unknown> = {}, useSession = true): Promise<any> {
	const id = nextId++;
	return new Promise((resolve, reject) => {
		waiting.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
		ws.send(JSON.stringify({ id, method, params, ...(useSession && sessionId ? { sessionId } : {}) }));
	});
}

const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, false);
({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }, false));
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');

async function evaluate<T>(expression: string): Promise<T> {
	const res = await send('Runtime.evaluate', {
		expression,
		awaitPromise: true,
		returnByValue: true
	});
	if (res.exceptionDetails) {
		throw new Error(`eval failed: ${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`);
	}
	return res.result.value as T;
}

async function goto(path: string) {
	await send('Page.navigate', { url: `${APP}${path}` });
	await waitFor(`document.readyState === 'complete'`, 15000);
}

async function waitFor(expression: string, timeout = 8000, label = expression) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		try {
			if (await evaluate<boolean>(`Boolean(${expression})`)) return true;
		} catch {
			/* page mid-navigation */
		}
		await new Promise((r) => setTimeout(r, 150));
	}
	const seen = await evaluate<string>(`document.body.innerText`).catch(() => '<unavailable>');
	throw new Error(`timed out waiting for: ${label}\n        page showed: ${JSON.stringify(seen)}`);
}

const text = (sel: string) => `document.querySelector(${JSON.stringify(sel)})?.textContent?.trim()`;
/** Every current route header uses the shared native-scale text-header utility. */
const title = text('.text-header');
const bodyText = `document.body.innerText`;

/**
 * The app is behind a sign-in screen now. Registration is closed after the first account, so
 * the session is minted out of band and handed to the browser: the cookie is the credential,
 * and the localStorage record is what lets the app know offline whose data it is holding.
 */
async function authenticate() {
	// Start from empty storage, so a profile carrying an older schema cannot decide the run.
	await send('Storage.clearDataForOrigin', { origin: APP, storageTypes: 'all' });
	const session = await signIn('smoke');
	const [name, value] = session.cookie.split('=');
	await send('Network.setCookie', { name, value, domain: 'localhost', path: '/' });
	await evaluate(
		`localStorage.setItem('tohab.session', ${JSON.stringify(
			JSON.stringify({ userId: session.userId, email: session.email })
		)})`
	);
	return session;
}

async function loginThroughUi(session: TestSession) {
	await waitFor(`document.querySelector('input[type="email"]')`, 8000, 'sign-in form');
	await evaluate(`(() => {
		const email = document.querySelector('input[type="email"]');
		const password = document.querySelector('input[type="password"]');
		email.value = ${JSON.stringify(session.email)};
		password.value = ${JSON.stringify(session.password)};
		email.dispatchEvent(new Event('input', { bubbles: true }));
		password.dispatchEvent(new Event('input', { bubbles: true }));
	})()`);
	await evaluate(`document.querySelector('form button[type="submit"]').click()`);
	await waitFor(`!document.querySelector('input[type="email"]') && document.querySelector('button[aria-label="New task"]')`, 20000, 'account database mounted');
}

try {
	// --- 0. an unauthenticated visit stops at the sign-in screen ---
	await goto('/tasks');
	await waitFor(`${text('h1')} === 'Tohab'`, 20000, 'sign-in screen rendered');
	check('unauthenticated visit shows sign-in', await evaluate<boolean>(`${bodyText}.includes('Password')`), true);
	check('unauthenticated visit hides the app', await evaluate<boolean>(`${bodyText}.includes('Tasks')`), false);

	const session = await authenticate();

	// --- 1. the app boots and lands on the default Today task view ---
	await goto('/tasks');
	await waitFor(`${title} === 'Today'`, 20000, 'tasks screen rendered');
	check('tasks screen renders', await evaluate(title), 'Today');

	// --- 2. the compose sheet parses natural language and persists ---
	await evaluate(`document.querySelector('button[aria-label="New task"]').click()`);
	await waitFor(
		`document.querySelector('input[placeholder="What needs doing?"]')`,
		5000,
		'compose sheet opened'
	);
	await evaluate(`(() => {
		const input = document.querySelector('input[placeholder="What needs doing?"]');
		input.value = 'buy oat milk tomorrow 5pm !!1';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	})()`);
	await waitFor(`${bodyText}.includes('Tomorrow')`, 5000, 'compose chip reflects the parse');
	check('compose previews the parsed date', await evaluate<boolean>(`${bodyText}.includes('Tomorrow')`), true);
	check('compose previews the priority', await evaluate<boolean>(`${bodyText}.includes('P1')`), true);

	await evaluate(`document.querySelector('form button[type=submit]').click()`);
	await waitFor(`!document.querySelector('input[placeholder="What needs doing?"]')`, 5000, 'compose closes after add');
	check('compose closes after adding the task', await evaluate<boolean>(`!document.querySelector('input[placeholder="What needs doing?"]')`), true);

	// The task is due tomorrow, so it belongs to Upcoming rather than Today.
	await goto('/tasks?view=upcoming');
	await waitFor(`${bodyText}.includes('buy oat milk')`, 8000, 'task appears in Upcoming');
	check('task was created with the parsed title', await evaluate<boolean>(`${bodyText}.includes('buy oat milk')`), true);

	// --- 3. it survives a reload, i.e. IndexedDB really persisted ---
	await goto('/tasks');
	await waitFor(`${title} === 'Today'`, 20000);
	await goto('/tasks?view=upcoming');
	await waitFor(`${bodyText}.includes('buy oat milk')`, 8000, 'task survived reload');
	check('task persisted across a reload', await evaluate<boolean>(`${bodyText}.includes('buy oat milk')`), true);

	// --- 3b. Inbox is the no-project list, All is everything ---
	await evaluate(`document.querySelector('button[aria-label="New task"]').click()`);
	await waitFor(`document.querySelector('input[placeholder="What needs doing?"]')`, 5000, 'compose reopened');
	await evaluate(`(() => {
		const i = document.querySelector('input[placeholder="What needs doing?"]');
		i.value = 'file taxes #finance';
		i.dispatchEvent(new Event('input', { bubbles: true }));
	})()`);
	await waitFor(`${bodyText}.includes('#finance')`, 5000, 'compose picked up the project');
	await evaluate(`document.querySelector('form button[type=submit]').click()`);
	await waitFor(`!document.querySelector('input[placeholder="What needs doing?"]')`, 5000, 'projected task added');

	await goto('/tasks?view=inbox');
	await waitFor(`${bodyText}.includes('buy oat milk')`, 8000, 'Inbox lists the unfiled task');
	check(
		'Inbox holds unfiled tasks only',
		await evaluate<boolean>(`${bodyText}.includes('buy oat milk') && !${bodyText}.includes('file taxes')`),
		true
	);

	await goto('/browse');
	await waitFor(`${bodyText}.includes('finance')`, 8000, 'Browse lists the project');
	await evaluate(`[...document.querySelectorAll('main a[href^="/projects/"]')].find(a => a.textContent.includes('finance')).click()`);
	await waitFor(`${bodyText}.includes('file taxes')`, 8000, 'project lists its task');
	check('projected task appears in its project', await evaluate<boolean>(`${bodyText}.includes('file taxes')`), true);

	// Back to Upcoming, where only the dated task lives, for the completion step.
	await goto('/tasks?view=upcoming');
	await waitFor(`${bodyText}.includes('buy oat milk')`, 8000, 'back on Upcoming');

	// --- 4. completing a task moves it out of the open views ---
	await evaluate(`document.querySelector('main button[aria-label="Mark as done"]').click()`);
	await waitFor(`!${bodyText}.includes('buy oat milk')`, 8000, 'completed task leaves Upcoming');
	check('completing removes it from Upcoming', await evaluate<boolean>(`${bodyText}.includes('buy oat milk')`), false);

	// --- 4b. show completed is how finished work is reached in the current view ---
	await goto('/tasks?view=upcoming');
	await waitFor(`!${bodyText}.includes('buy oat milk')`, 8000, 'Upcoming hides completed by default');
	check('Upcoming hides completed tasks by default', await evaluate<boolean>(`${bodyText}.includes('buy oat milk')`), false);

	await evaluate(`document.querySelector('header button[aria-label="Sort and group"]').click()`);
	await waitFor(`${bodyText}.includes('Sort & group')`, 5000, 'options sheet opened');
	await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Show completed tasks').click()`);
	await waitFor(`${bodyText}.includes('buy oat milk')`, 8000, 'completed task joins Upcoming');
	check('show completed reveals the done task', await evaluate<boolean>(`${bodyText}.includes('buy oat milk')`), true);

	await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Priority').click()`);
	await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
	await waitFor(`document.querySelector('main h2')`, 5000, 'group headings rendered');
	check(
		'grouping by priority heads the list with P1',
		await evaluate<boolean>(`document.querySelector('main h2').textContent.includes('Priority 1')`),
		true
	);

	await goto('/tasks?view=upcoming');
	await waitFor(`document.querySelector('main h2')`, 8000, 'options survived reload');
	check(
		'view options persist across a reload',
		await evaluate<boolean>(`document.querySelector('main h2').textContent.includes('Priority 1') && ${bodyText}.includes('buy oat milk')`),
		true
	);

	// --- 5. habits: create, log, and confirm the streak ---
	await goto('/habits');
	await waitFor(`${title} === 'Journal'`, 20000, 'habit journal rendered');
	check('habit journal renders', await evaluate(title), 'Journal');

	await evaluate(`document.querySelector('button[aria-label="New habit"]').click()`);
	await waitFor(`document.querySelector('input[placeholder="Habit name"]')`, 5000, 'habit sheet opened');
	await evaluate(`(() => {
		const input = document.querySelector('input[placeholder="Habit name"]');
		input.value = 'Morning run';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	})()`);
	await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Create habit').click()`);
	await waitFor(`${bodyText}.includes('Morning run')`, 8000, 'habit created');
	check('habit was created', await evaluate<boolean>(`${bodyText}.includes('Morning run')`), true);
	check('new habit starts undone', await evaluate<boolean>(`${bodyText}.includes('Not done yet')`), true);

	await evaluate(`document.querySelector('main button[aria-label="Log Morning run"]').click()`);
	await waitFor(`${bodyText}.includes('1 day')`, 8000, 'streak became 1 day');
	check('logging the habit starts a 1 day streak', await evaluate<boolean>(`${bodyText}.includes('🔥 1 day')`), true);
	check('day counter reflects the log', await evaluate<boolean>(`${bodyText}.includes('1 of 1 done')`), true);

	// --- 6. habit detail shows stats and the heatmap ---
	await evaluate(`document.querySelector('main a[href^="/habits/"]').click()`);
	await waitFor(`${bodyText}.includes('Last 12 weeks')`, 10000, 'habit detail rendered');
	check('detail shows the heatmap', await evaluate<boolean>(`${bodyText}.includes('Last 12 weeks')`), true);
	check('detail shows streak stats', await evaluate<boolean>(`${bodyText}.includes('Streak') && ${bodyText}.includes('Best')`), true);
	check(
		'heatmap renders 12 weeks of days',
		await evaluate<number>(`document.querySelectorAll('button[aria-label*=":"]').length`),
		84
	);

	// --- 7. settings renders and reports sync state ---
	await goto('/tasks');
	await waitFor(`document.querySelector('button[aria-label="Settings"]')`, 20000, 'settings button');
	await evaluate(`document.querySelector('button[aria-label="Settings"]').click()`);
	await waitFor(`${bodyText}.includes('Sync with server')`, 10000, 'settings sheet opened');
	check('settings sheet opens', await evaluate<boolean>(`${bodyText}.includes('Server URL')`), true);
	check('settings shows the account', await evaluate<boolean>(`${bodyText}.includes(${JSON.stringify(session.email)})`), true);

	// --- 8. the client actually replicated to the server ---
	// Sampling twice would race: an incoming change event flips the badge back to Syncing.
	const reachedSynced = await waitFor(`${bodyText}.includes('Status: synced')`, 20000, 'sync badge reached synced');
	check('sync badge reports synced', reachedSynced, true);

	const pulled = await (
		await fetch(`http://localhost:5178/sync/pull?collection=habits&cursor=0&id=&limit=50`, {
			headers: { cookie: session.cookie }
		})
	).json();
	check('habit reached the sync server', pulled.documents.map((d: any) => d.name), ['Morning run']);

	const pulledTasks = await (
		await fetch(`http://localhost:5178/sync/pull?collection=tasks&cursor=0&id=&limit=50`, {
			headers: { cookie: session.cookie }
		})
	).json();
	check('task reached the sync server', pulledTasks.documents.map((d: any) => d.title).sort(), [
		'buy oat milk',
		'file taxes'
	]);

	// --- 9. switching accounts in one page closes RxDB and mounts the correct isolated store ---
	const second = await signIn('smoke-second');
	await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Sign out').click()`);
	await loginThroughUi(second);
	await goto('/habits');
	check('second account cannot query first account habits', await evaluate<boolean>(`!${bodyText}.includes('Morning run')`), true);
	await goto('/tasks?view=inbox');
	check('second account cannot query first account tasks', await evaluate<boolean>(`!${bodyText}.includes('file taxes') && !${bodyText}.includes('buy oat milk')`), true);
	await evaluate(`document.querySelector('button[aria-label="New task"]').click()`);
	await waitFor(`document.querySelector('input[placeholder="What needs doing?"]')`, 5000, 'second account compose');
	await evaluate(`(() => {
		const input = document.querySelector('input[placeholder="What needs doing?"]');
		input.value = 'second account only';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	})()`);
	await evaluate(`document.querySelector('form button[type=submit]').click()`);
	await waitFor(`${bodyText}.includes('second account only')`, 8000, 'second account task created');

	await evaluate(`document.querySelector('button[aria-label="Settings"]').click()`);
	await waitFor(`${bodyText}.includes('Sync with server')`, 8000, 'second account settings');
	await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Sign out').click()`);
	await loginThroughUi(session);
	await goto('/habits');
	await waitFor(`${bodyText}.includes('Morning run')`, 8000, 'first account database remounted');
	check('first account data returns after switching back', await evaluate<boolean>(`${bodyText}.includes('Morning run') && !${bodyText}.includes('second account only')`), true);

	// --- 10. no console errors along the way ---
	check('no console errors', consoleErrors, []);
} catch (err) {
	failures++;
	console.log(`FAIL  ${err instanceof Error ? err.message : err}`);
	if (consoleErrors.length) console.log('  console output:\n   ' + consoleErrors.join('\n   '));
} finally {
	await cleanup();
	ws.close();
	chrome.kill();
	try {
		rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
	} catch {
		/* Chrome may still be releasing the profile */
	}
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
