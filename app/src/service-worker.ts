/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';
import { shouldBypassServiceWorker, shouldRuntimeCacheRequest } from './lib/pwa.ts';

const sw = self as unknown as ServiceWorkerGlobalScope;
const PRECACHE_NAME = `tohab-shell-${version}`;
const RUNTIME_NAME = `tohab-runtime-${version}`;
const PRECACHE = [...new Set([...build, ...files, '/'])];
const MAX_RUNTIME_ENTRIES = 60;

async function trimRuntimeCache(cache: Cache) {
	const keys = await cache.keys();
	await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_RUNTIME_ENTRIES)).map((key) => cache.delete(key)));
}

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(PRECACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
});

sw.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') void sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => ![PRECACHE_NAME, RUNTIME_NAME].includes(key)).map((key) => caches.delete(key))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== location.origin || shouldBypassServiceWorker(url)) return;

	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(async () => {
				const cache = await caches.open(PRECACHE_NAME);
				return (await cache.match('/')) ?? Response.error();
			})
		);
		return;
	}

	if (PRECACHE.includes(url.pathname)) {
		event.respondWith(caches.open(PRECACHE_NAME).then(async (cache) => (await cache.match(url.pathname)) ?? fetch(request)));
		return;
	}

	if (!shouldRuntimeCacheRequest(request.destination)) return;

	// Only same-origin static asset destinations use a bounded runtime cache. Fetch/XHR data
	// never enters it, regardless of a custom sync-server path.
	event.respondWith(
		caches.open(RUNTIME_NAME).then(async (cache) => {
			try {
				const response = await fetch(request);
				if (response.ok && response.type === 'basic') {
					await cache.put(request, response.clone());
					await trimRuntimeCache(cache);
				}
				return response;
			} catch (error) {
				const cached = await cache.match(request);
				if (cached) return cached;
				throw error;
			}
		})
	);
});

sw.addEventListener('push', (event) => {
	let data: { title?: string; body?: string; url?: string; badge?: number; tag?: string } = {};
	try { data = event.data?.json() ?? {}; } catch { data = { body: event.data?.text() }; }
	event.waitUntil(Promise.all([
		sw.registration.showNotification(data.title || 'Tohab', {
			body: data.body || 'You have an update.',
			icon: '/icons/icon-192.png',
			badge: '/icons/icon-192.png',
			tag: data.tag,
			data: { url: data.url || '/tasks' }
		}),
		data.badge != null && 'setAppBadge' in sw.registration
			? (sw.registration as ServiceWorkerRegistration & { setAppBadge(value: number): Promise<void> }).setAppBadge(data.badge)
			: Promise.resolve()
	]));
});

sw.addEventListener('pushsubscriptionchange', (event) => {
	event.waitUntil((async () => {
		const configResponse = await fetch('/push/config', { credentials: 'include' });
		if (!configResponse.ok) return;
		const config = await configResponse.json() as { publicKey?: string };
		if (!config.publicKey) return;
		const padding = '='.repeat((4 - config.publicKey.length % 4) % 4);
		const raw = atob((config.publicKey + padding).replace(/-/g, '+').replace(/_/g, '/'));
		const applicationServerKey = Uint8Array.from(raw, (character) => character.charCodeAt(0));
		const subscription = await sw.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
		const json = subscription.toJSON();
		await fetch('/push/subscription', {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				endpoint: json.endpoint,
				keys: json.keys,
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
				leadMinutes: 10
			})
		});
	})());
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const target = new URL(event.notification.data?.url || '/tasks', sw.location.origin).href;
	event.waitUntil(sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
		const existing = clients.find((client) => client.url === target) as WindowClient | undefined;
		if (existing) return existing.focus();
		return sw.clients.openWindow(target);
	}));
});
