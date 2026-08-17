/**
 * Browser smoke test: drives headless Chrome over CDP against a running dev/preview server.
 * Verifies the app boots, RxDB persists across reloads, and the core flows work.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
	throw new Error(`timed out waiting for: ${label}`);
}

const text = (sel: string) => `document.querySelector(${JSON.stringify(sel)})?.textContent?.trim()`;
const bodyText = `document.body.innerText`;

try {
	// --- 1. the app boots and lands on Tasks ---
	await goto('/tasks');
	await waitFor(`${text('h1')} === 'Tasks'`, 20000, 'tasks screen rendered');
	check('tasks screen renders', await evaluate(text('h1')), 'Tasks');

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
	await waitFor(`${bodyText}.includes('1 added')`, 5000, 'compose confirms the add');
	check('compose stays open for the next task', await evaluate<boolean>(`${bodyText}.includes('1 added')`), true);

	await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
	await waitFor(`!document.querySelector('input[placeholder="What needs doing?"]')`, 5000, 'sheet closed');

	// The task is due tomorrow, so it belongs to Upcoming rather than Today.
	await evaluate(`[...document.querySelectorAll('header button')].find(b => b.textContent.trim() === 'Upcoming').click()`);
	await waitFor(`${bodyText}.includes('buy oat milk')`, 8000, 'task appears in Upcoming');
	check('task was created with the parsed title', await evaluate<boolean>(`${bodyText}.includes('buy oat milk')`), true);

	// --- 3. it survives a reload, i.e. IndexedDB really persisted ---
	await goto('/tasks');
	await waitFor(`${text('h1')} === 'Tasks'`, 20000);
	await evaluate(`[...document.querySelectorAll('header button')].find(b => b.textContent.trim() === 'Upcoming').click()`);
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
	await waitFor(`${bodyText}.includes('1 added')`, 5000, 'projected task added');
	await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
	await waitFor(`!document.querySelector('input[placeholder="What needs doing?"]')`, 5000, 'sheet closed');

	await evaluate(`[...document.querySelectorAll('header button')].find(b => b.textContent.trim() === 'Inbox').click()`);
	await waitFor(`${bodyText}.includes('buy oat milk')`, 8000, 'Inbox lists the unfiled task');
	check(
		'Inbox holds unfiled tasks only',
		await evaluate<boolean>(`${bodyText}.includes('buy oat milk') && !${bodyText}.includes('file taxes')`),
		true
	);

	await evaluate(`[...document.querySelectorAll('header button')].find(b => b.textContent.trim() === 'All').click()`);
	await waitFor(`${bodyText}.includes('file taxes')`, 8000, 'All lists the projected task');
	check(
		'All spans every project',
		await evaluate<boolean>(`${bodyText}.includes('buy oat milk') && ${bodyText}.includes('file taxes')`),
		true
	);

	// Back to Upcoming, where only the dated task lives, for the completion step.
	await evaluate(`[...document.querySelectorAll('header button')].find(b => b.textContent.trim() === 'Upcoming').click()`);
	await waitFor(`${bodyText}.includes('buy oat milk')`, 8000, 'back on Upcoming');

	// --- 4. completing a task moves it out of the open views ---
	await evaluate(`document.querySelector('main button[aria-label="Mark as done"]').click()`);
	await waitFor(`!${bodyText}.includes('buy oat milk')`, 8000, 'completed task leaves Upcoming');
	check('completing removes it from Upcoming', await evaluate<boolean>(`${bodyText}.includes('buy oat milk')`), false);

	// --- 4b. show completed is how finished work is reached, per view ---
	await evaluate(`[...document.querySelectorAll('header button')].find(b => b.textContent.trim() === 'All').click()`);
	await waitFor(`!${bodyText}.includes('buy oat milk')`, 8000, 'All hides completed by default');
	check('All hides completed tasks by default', await evaluate<boolean>(`${bodyText}.includes('buy oat milk')`), false);

	await evaluate(`document.querySelector('header button[aria-label="Sort and group"]').click()`);
	await waitFor(`${bodyText}.includes('Sort & group')`, 5000, 'options sheet opened');
	await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Show completed tasks').click()`);
	await waitFor(`${bodyText}.includes('buy oat milk')`, 8000, 'completed task joins All');
	check('show completed reveals the done task', await evaluate<boolean>(`${bodyText}.includes('buy oat milk')`), true);

	await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Priority').click()`);
	await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
	await waitFor(`document.querySelector('main h2')`, 5000, 'group headings rendered');
	check(
		'grouping by priority heads the list with P1',
		await evaluate<boolean>(`document.querySelector('main h2').textContent.includes('Priority 1')`),
		true
	);

	await goto('/tasks');
	await waitFor(`${text('h1')} === 'Tasks'`, 20000);
	await evaluate(`[...document.querySelectorAll('header button')].find(b => b.textContent.trim() === 'All').click()`);
	await waitFor(`document.querySelector('main h2')`, 8000, 'options survived reload');
	check(
		'view options persist across a reload',
		await evaluate<boolean>(`document.querySelector('main h2').textContent.includes('Priority 1') && ${bodyText}.includes('buy oat milk')`),
		true
	);

	// --- 5. habits: create, log, and confirm the streak ---
	await goto('/habits');
	await waitFor(`${text('h1')} === 'Habits'`, 20000, 'habits screen rendered');
	check('habits screen renders', await evaluate(text('h1')), 'Habits');

	await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Create your first habit')).click()`);
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
	await goto('/settings');
	await waitFor(`${text('h1')} === 'Settings'`, 20000, 'settings rendered');
	check('settings renders', await evaluate(text('h1')), 'Settings');
	check('settings shows the device id', await evaluate<boolean>(`${bodyText}.includes('Device ID')`), true);

	// --- 8. the client actually replicated to the server ---
	// Sampling twice would race: an incoming change event flips the badge back to Syncing.
	const reachedSynced = await waitFor(`${bodyText}.includes('Synced')`, 20000, 'sync badge reached Synced');
	check('sync badge reports Synced', reachedSynced, true);

	const userId = await evaluate<string>(`localStorage.getItem('tohab.userId')`);
	const pulled = await (
		await fetch(`http://localhost:5178/sync/pull?collection=habits&cursor=0&id=&limit=50`, {
			headers: { 'x-user-id': userId }
		})
	).json();
	check('habit reached the sync server', pulled.documents.map((d: any) => d.name), ['Morning run']);

	const pulledTasks = await (
		await fetch(`http://localhost:5178/sync/pull?collection=tasks&cursor=0&id=&limit=50`, {
			headers: { 'x-user-id': userId }
		})
	).json();
	check('task reached the sync server', pulledTasks.documents.map((d: any) => d.title).sort(), [
		'buy oat milk',
		'file taxes'
	]);

	// --- 9. no console errors along the way ---
	check('no console errors', consoleErrors, []);
} catch (err) {
	failures++;
	console.log(`FAIL  ${err instanceof Error ? err.message : err}`);
	if (consoleErrors.length) console.log('  console output:\n   ' + consoleErrors.join('\n   '));
} finally {
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
