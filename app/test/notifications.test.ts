import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pushBase, sendTestNotification, urlBase64ToUint8Array } from '../src/lib/notifications.ts';

assert.equal(pushBase('/sync'), '/push');
assert.equal(pushBase('https://example.test/sync'), 'https://example.test/push');
assert.equal(pushBase('https://example.test/custom'), 'https://example.test/custom/push');
assert.deepEqual([...urlBase64ToUint8Array('AQIDBA')], [1, 2, 3, 4]);

const settings = readFileSync(new URL('../src/lib/components/SettingsContent.svelte', import.meta.url), 'utf8');
const badge = readFileSync(new URL('../src/lib/components/AppBadge.svelte', import.meta.url), 'utf8');
assert.match(settings, /Task notifications/);
assert.match(settings, /Enable notifications/);
assert.match(settings, /Send test/);
assert.match(badge, /setAppBadge/);
assert.match(badge, /reconcileNotifications/);

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
globalThis.fetch = async () => new Response(JSON.stringify({ ok: false }), {
	status: 200,
	headers: { 'content-type': 'application/json' }
});
await assert.rejects(sendTestNotification('/sync'), /could not deliver/);
globalThis.fetch = originalFetch;

console.log('ok notification client contracts');
