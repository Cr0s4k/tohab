import { settings } from './settings.svelte.ts';

/** The calendar routes sit beside the sync routes, not under them. */
export function calendarBase(serverUrl: string): string {
	const trimmed = serverUrl.replace(/\/+$/, '');
	const root = trimmed.endsWith('/sync') ? trimmed.slice(0, -'/sync'.length) : trimmed;
	return `${root}/calendar`;
}

/**
 * Absolute by construction: a calendar client fetches this from its own servers, where a
 * relative path means nothing.
 */
export async function feedUrl(alarmMinutes: number): Promise<string> {
	const base = new URL(calendarBase(settings.serverUrl), location.origin);

	const res = await fetch(`${base}/token`, { headers: { 'x-user-id': settings.userId } });
	if (!res.ok) throw new Error(`Server returned ${res.status}`);
	const { token } = (await res.json()) as { token?: string };
	if (!token) throw new Error('Server did not return a feed token');

	const url = new URL(`${base}/${token}/tohab.ics`);
	url.searchParams.set('alarm', String(alarmMinutes));
	return url.toString();
}
