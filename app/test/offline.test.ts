/** Verifies a clean service-worker install can launch an unvisited route offline. */
import assert from 'node:assert/strict';
import { launchChrome } from './cdp.ts';

const APP = process.env.APP ?? 'http://localhost:5177';
const PORT = 9334;
const browser = await launchChrome({ port: PORT, profilePrefix: 'tohab-offline-chrome-' });
const { attachPage, close, evaluate, navigate, send } = browser;

try {
	await attachPage();
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
	close();
}
