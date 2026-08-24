export const API_ROUTE_PREFIXES = ['/sync', '/auth', '/calendar', '/push'] as const;

export type ApiService = 'auth' | 'calendar' | 'push';

export function syncBase(serverUrl: string): string {
	return serverUrl.replace(/\/+$/, '') || '/sync';
}

export function apiBase(serverUrl: string, service: ApiService): string {
	const sync = syncBase(serverUrl);
	const root = sync.endsWith('/sync') ? sync.slice(0, -'/sync'.length) : sync;
	return `${root}/${service}`;
}
