import { isIosLike } from './pwa.ts';

export type NotificationCapability = {
	supported: boolean;
	installed: boolean;
	permission: NotificationPermission | 'unsupported';
	reason: string;
};

export function pushBase(serverUrl: string): string {
	const trimmed = serverUrl.replace(/\/+$/, '');
	const root = trimmed.endsWith('/sync') ? trimmed.slice(0, -'/sync'.length) : trimmed;
	return `${root || ''}/push`;
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
	const padding = '='.repeat((4 - value.length % 4) % 4);
	const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64);
	return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function notificationCapability(): NotificationCapability {
	if (typeof window === 'undefined') return { supported: false, installed: false, permission: 'unsupported', reason: 'Unavailable outside a browser.' };
	const installed = matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
	if (!isSecureContext) return { supported: false, installed, permission: 'unsupported', reason: 'Notifications require HTTPS.' };
	if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
		return { supported: false, installed, permission: 'unsupported', reason: 'Web Push is not supported by this browser.' };
	}
	const ios = isIosLike(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
	if (ios && !installed) return { supported: false, installed, permission: Notification.permission, reason: 'On iPhone or iPad, install Tohab to the Home Screen first.' };
	return { supported: true, installed, permission: Notification.permission, reason: '' };
}

async function request(serverUrl: string, path: string, init: RequestInit = {}) {
	const response = await fetch(`${pushBase(serverUrl)}${path}`, {
		credentials: 'include',
		...init,
		headers: { 'content-type': 'application/json', ...(init.headers ?? {}) }
	});
	const data = await response.json().catch(() => ({})) as { error?: string; publicKey?: string; available?: boolean; ok?: boolean };
	if (!response.ok) throw new Error(data.error ?? `Notification request failed (${response.status})`);
	return data;
}

function subscriptionBody(subscription: PushSubscription, leadMinutes: number) {
	const json = subscription.toJSON();
	if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('Browser returned an incomplete push subscription.');
	return {
		endpoint: json.endpoint,
		keys: json.keys,
		timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
		leadMinutes
	};
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
	if (!('serviceWorker' in navigator)) return null;
	const registration = await navigator.serviceWorker.ready;
	return registration.pushManager.getSubscription();
}

export async function enableNotifications(serverUrl: string, leadMinutes: number): Promise<void> {
	const capability = notificationCapability();
	if (!capability.supported) throw new Error(capability.reason);
	const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
	if (permission !== 'granted') throw new Error('Notification permission was not granted.');
	const config = await request(serverUrl, '/config');
	if (!config.available || !config.publicKey) throw new Error('Push notifications are not configured on the server.');
	const registration = await navigator.serviceWorker.ready;
	const existing = await registration.pushManager.getSubscription();
	const subscription = existing ?? await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(config.publicKey)
	});
	await request(serverUrl, '/subscription', { method: 'POST', body: JSON.stringify(subscriptionBody(subscription, leadMinutes)) });
}

export async function reconcileNotifications(serverUrl: string, leadMinutes: number): Promise<boolean> {
	if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return false;
	const subscription = await currentPushSubscription();
	if (!subscription) return false;
	await request(serverUrl, '/subscription', { method: 'POST', body: JSON.stringify(subscriptionBody(subscription, leadMinutes)) });
	return true;
}

export async function disableNotifications(serverUrl: string): Promise<void> {
	const subscription = await currentPushSubscription();
	if (!subscription) {
		await clearAppBadge();
		return;
	}
	const endpoint = subscription.endpoint;
	await subscription.unsubscribe();
	try {
		await request(serverUrl, '/subscription', { method: 'DELETE', body: JSON.stringify({ endpoint }) });
	} finally {
		await clearAppBadge();
	}
}

export async function sendTestNotification(serverUrl: string): Promise<void> {
	const subscription = await currentPushSubscription();
	if (!subscription) throw new Error('Notifications are not enabled on this device.');
	await request(serverUrl, '/test', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) });
}

export async function setAppBadge(count: number): Promise<void> {
	const nav = navigator as Navigator & { setAppBadge?: (value?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
	if (count > 0) await nav.setAppBadge?.(count);
	else await nav.clearAppBadge?.();
}

export async function clearAppBadge(): Promise<void> {
	const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
	await nav.clearAppBadge?.();
}
