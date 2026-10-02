import { browser } from '$app/env';
import { settings } from './settings.svelte.ts';
import { apiBase } from './api.ts';

/**
 * The session itself is an httpOnly cookie that this code cannot read. What is kept here is
 * only the identity it belongs to, so a cold offline launch can render the right screen and
 * scope the local database without asking the server anything.
 */
export type Session = { userId: string; email: string };

const KEY = 'tohab.session';

function stored(): Session | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Session;
		return parsed.userId ? parsed : null;
	} catch {
		return null;
	}
}

export const auth = $state({
	session: stored() as Session | null,
	/** Unknown until the server answers, which it cannot do on a first offline launch. */
	registrationOpen: null as boolean | null
});

/** Auth routes sit beside the sync routes, not under them — same shape as the calendar base. */
export function authBase(serverUrl: string): string {
	return apiBase(serverUrl, 'auth');
}

async function post(path: string, body?: unknown) {
	const res = await fetch(`${authBase(settings.serverUrl)}${path}`, {
		method: 'POST',
		credentials: 'include',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body ?? {})
	});
	const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<Session>;
	if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
	return data;
}

function remember(session: Session) {
	auth.session = session;
	localStorage.setItem(KEY, JSON.stringify(session));
}

export function forget() {
	auth.session = null;
	localStorage.removeItem(KEY);
}

export async function refreshRegistrationState() {
	try {
		const res = await fetch(`${authBase(settings.serverUrl)}/state`, { credentials: 'include' });
		if (!res.ok) return;
		const { registrationOpen } = (await res.json()) as { registrationOpen?: boolean };
		auth.registrationOpen = Boolean(registrationOpen);
	} catch {
		// Offline: leave it unknown rather than guessing the server is closed.
	}
}

export async function register(email: string, password: string) {
	const data = await post('/register', { email, password });
	remember({ userId: data.userId!, email: data.email! });
	auth.registrationOpen = false;
}

export async function login(email: string, password: string) {
	const data = await post('/login', { email, password });
	remember({ userId: data.userId!, email: data.email! });
}

export async function logout() {
	try {
		await post('/logout');
	} catch {
		// The cookie may already be gone; clearing the local side is what matters.
	}
	forget();
}
