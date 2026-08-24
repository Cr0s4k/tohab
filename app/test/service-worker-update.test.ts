/** Verifies a changed worker waits, then activates only after SKIP_WAITING. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { launchChrome } from './cdp.ts';

const APP = process.env.APP ?? 'http://localhost:5179';
const WORKER = new URL('../build/service-worker.js', import.meta.url);
const originalWorker = readFileSync(WORKER, 'utf8');
const PORT = 9335;
const browser = await launchChrome({ port: PORT, profilePrefix: 'tohab-update-chrome-' });
const { attachPage, close, evaluate } = browser;

try {
	await attachPage(APP);
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
	close();
}
