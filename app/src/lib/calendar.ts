import { settings } from './settings.svelte.ts';
import { apiBase } from './api.ts';

/** The calendar routes sit beside the sync routes, not under them. */
export function calendarBase(serverUrl: string): string {
	return apiBase(serverUrl, 'calendar');
}

/**
 * Absolute by construction: a calendar client fetches this from its own servers, where a
 * relative path means nothing.
 */
export async function feedUrl(): Promise<string> {
	const base = new URL(calendarBase(settings.serverUrl), location.origin);

	const res = await fetch(`${base}/token`, { credentials: 'include' });
	if (!res.ok) throw new Error(`Server returned ${res.status}`);
	const { token, feedUrl: publicFeedUrl } = (await res.json()) as {
		token?: string;
		feedUrl?: string;
	};
	if (!token) throw new Error('Server did not return a feed token');
	if (publicFeedUrl) return new URL(publicFeedUrl).toString();

	return new URL(`${base}/${token}/tohab.ics`).toString();
}
