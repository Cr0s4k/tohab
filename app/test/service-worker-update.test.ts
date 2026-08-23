/** Verifies a changed worker waits, then activates only after SKIP_WAITING. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = process.env.APP ?? 'http://localhost:5179';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WORKER = new URL('../build/service-worker.js', import.meta.url);
const originalWorker = readFileSync(WORKER, 'utf8');
const PORT = 9335;
const profile = mkdtempSync(join(tmpdir(), 'tohab-update-chrome-'));
const chrome = spawn(CHROME, [
	'--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
	'--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'
], { stdio: 'ignore' });

async function browserWsUrl(): Promise<string> {
	for (let i = 0; i < 80; i++) {
		try {
			const json = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json() as { webSocketDebuggerUrl: string };
			if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
		} catch { /* starting */ }
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

try {
	const { targetId } = await send('Target.createTarget', { url: APP }, false);
	({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }, false));
	await send('Page.enable');
	await send('Runtime.enable');
	for (let i = 0; i < 80 && !(await evaluate(`location.origin === ${JSON.stringify(APP)} && document.readyState === 'complete'`)); i++) {
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	assert.equal(await evaluate(`'serviceWorker' in navigator`), true, 'service workers are available');
	await evaluate(`navigator.serviceWorker.ready.then(() => true)`);
	for (let i = 0; i < 80 && !(await evaluate(`!!navigator.serviceWorker.controller`)); i++) {
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	assert.equal(await evaluate(`!!navigator.serviceWorker.controller`), true, 'initial worker controls the page');

	writeFileSync(WORKER, `${originalWorker}\n// update-test-${Date.now()}\n`);
	await evaluate(`navigator.serviceWorker.getRegistration().then(r => r.update()).then(() => true)`);
	for (let i = 0; i < 80 && !(await evaluate(`navigator.serviceWorker.getRegistration().then(r => !!r.waiting)`)); i++) {
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	assert.equal(await evaluate(`navigator.serviceWorker.getRegistration().then(r => !!r.waiting)`), true, 'changed worker waits for user activation');
	assert.equal(await evaluate(`navigator.serviceWorker.getRegistration().then(r => r.active.state)`), 'activated');

	const changed = evaluate(`new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(true), { once: true }))`);
	await evaluate(`navigator.serviceWorker.getRegistration().then(r => { r.waiting.postMessage({type:'SKIP_WAITING'}); return true; })`);
	assert.equal(await changed, true, 'SKIP_WAITING activates and claims the page');
	console.log('ok coordinated service-worker update activation');
} finally {
	writeFileSync(WORKER, originalWorker);
	ws.close();
	chrome.kill();
	try { rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch { /* browser may still release files */ }
}
