import assert from 'node:assert/strict';
import { pushBase, sendTestNotification, urlBase64ToUint8Array } from '../src/lib/notifications.ts';
import { API_ROUTE_PREFIXES, apiBase, syncBase } from '../src/lib/api.ts';
import { readFileSync } from 'node:fs';

assert.deepEqual(API_ROUTE_PREFIXES, ['/sync', '/auth', '/calendar', '/push']);
assert.equal(syncBase('/sync/'), '/sync');
assert.equal(apiBase('/sync', 'auth'), '/auth');
assert.equal(apiBase('https://example.test/sync', 'calendar'), 'https://example.test/calendar');
assert.equal(pushBase('/sync'), '/push');
assert.equal(pushBase('https://example.test/sync'), 'https://example.test/push');
assert.equal(pushBase('https://example.test/custom'), 'https://example.test/custom/push');
assert.deepEqual([...urlBase64ToUint8Array('AQIDBA')], [1, 2, 3, 4]);

Object.defineProperty(globalThis, 'navigator', {
	configurable: true,
	value: {
		serviceWorker: {
			ready: Promise.resolve({
				pushManager: {
					getSubscription: async () => ({ endpoint: 'https://push.example.test/device' })
				}
			})
		}
	}
});
const originalFetch = globalThis.fetch;
let requestedUrl = '';
let requestedInit: RequestInit | undefined;
globalThis.fetch = async (input, init) => {
	requestedUrl = String(input);
	requestedInit = init;
	return new Response(JSON.stringify({ ok: false }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
};
await assert.rejects(sendTestNotification('/sync'), /could not deliver/);
assert.equal(requestedUrl, '/push/test');
assert.equal(requestedInit?.method, 'POST');
assert.equal(requestedInit?.credentials, 'include');
globalThis.fetch = originalFetch;

const reminderPicker = readFileSync(new URL('../src/lib/components/task/TaskReminderPicker.svelte', import.meta.url), 'utf8');
assert.match(reminderPicker, /Automatic/);
assert.match(reminderPicker, /None/);
assert.match(reminderPicker, /At time/);
const settingsSource = readFileSync(new URL('../src/lib/settings.svelte.ts', import.meta.url), 'utf8');
assert.match(settingsSource, /legacy === '0' \? -1/);

console.log('ok notification client contracts');
