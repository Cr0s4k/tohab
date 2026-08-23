/** Verifies a clean service-worker install can launch an unvisited route offline. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = process.env.APP ?? 'http://localhost:5177';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9334;
const profile = mkdtempSync(join(tmpdir(), 'tohab-offline-chrome-'));
const chrome = spawn(CHROME, [
	'--headless=new',
	`--remote-debugging-port=${PORT}`,
	`--user-data-dir=${profile}`,
	'--no-first-run',
	'--no-default-browser-check',
	'--disable-gpu',
	'about:blank'
], { stdio: 'ignore' });

async function browserWsUrl(): Promise<string> {
	for (let i = 0; i < 80; i++) {
		try {
			const json = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json() as { webSocketDebuggerUrl: string };
			if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
		} catch { /* browser is starting */ }
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error('Chrome did not expose a debugging endpoint');
}

const ws = new WebSocket(await browserWsUrl());
await new Promise<void>((resolve, reject) => {
	ws.addEventListener('open', () => resolve(), { once: true });
	ws.addEventListener('error', reject, { once: true });
});

let nextId = 1;
let sessionId: string | undefined;
const waiting = new Map<number, (message: any) => void>();
ws.addEventListener('message', (event) => {
	const message = JSON.parse(String(event.data));
	if (!message.id || !waiting.has(message.id)) return;
	waiting.get(message.id)!(message);
	waiting.delete(message.id);
});

function send(method: string, params: Record<string, unknown> = {}, useSession = true): Promise<any> {
	const id = nextId++;
	return new Promise((resolve, reject) => {
		waiting.set(id, (message) => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
		ws.send(JSON.stringify({ id, method, params, ...(useSession && sessionId ? { sessionId } : {}) }));
	});
}

async function evaluate<T>(expression: string): Promise<T> {
	const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
	if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
	return result.result.value as T;
}

async function navigate(url: string): Promise<void> {
	await send('Page.navigate', { url });
	for (let i = 0; i < 80; i++) {
		if (await evaluate(`document.readyState === 'complete'`)) return;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`navigation did not complete: ${url}`);
}

try {
	const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, false);
	({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }, false));
	await send('Page.enable');
	await send('Runtime.enable');
	await send('Network.enable');
	await navigate(`${APP}/tasks`);

	await evaluate(`navigator.serviceWorker.ready.then(() => true)`);
	for (let i = 0; i < 80 && !(await evaluate(`!!navigator.serviceWorker.controller`)); i++) {
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	assert.equal(await evaluate(`!!navigator.serviceWorker.controller`), true, 'service worker controls the clean install');
	assert.equal(await evaluate(`caches.match('/').then(Boolean)`), true, 'offline shell is precached');

	await send('Network.emulateNetworkConditions', {
		offline: true,
		latency: 0,
		downloadThroughput: 0,
		uploadThroughput: 0,
		connectionType: 'none'
	});
	await navigate(`${APP}/habits`);
	assert.equal(await evaluate(`document.body.innerText.includes('Password')`), true, 'unvisited route launches the app shell offline');
	assert.equal(await evaluate(`!!navigator.serviceWorker.controller`), true, 'offline deep link remains service-worker controlled');
	console.log('ok clean-install offline deep-link launch');
} finally {
	ws.close();
	chrome.kill();
	try { rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch { /* browser may still release files */ }
}
