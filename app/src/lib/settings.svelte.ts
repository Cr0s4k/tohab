import { browser } from '$app/environment';
import { uid } from './ids.ts';

export type Theme = 'system' | 'light' | 'dark';

function read(key: string, fallback: string): string {
	if (!browser) return fallback;
	return localStorage.getItem(key) ?? fallback;
}

function persistedUserId(): string {
	if (!browser) return 'local';
	let id = localStorage.getItem('tohab.userId');
	if (!id) {
		id = uid();
		localStorage.setItem('tohab.userId', id);
	}
	return id;
}

export const settings = $state({
	theme: read('tohab.theme', 'system') as Theme,
	serverUrl: read('tohab.serverUrl', '/sync'),
	syncEnabled: read('tohab.syncEnabled', 'true') === 'true',
	userId: persistedUserId(),
	startOfWeek: Number(read('tohab.startOfWeek', '1')) as 0 | 1
});

export function applyTheme() {
	if (!browser) return;
	const dark =
		settings.theme === 'dark' ||
		(settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
	document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function setTheme(theme: Theme) {
	settings.theme = theme;
	localStorage.setItem('tohab.theme', theme);
	applyTheme();
}

export function setServerUrl(url: string) {
	settings.serverUrl = url;
	localStorage.setItem('tohab.serverUrl', url);
}

export function setSyncEnabled(on: boolean) {
	settings.syncEnabled = on;
	localStorage.setItem('tohab.syncEnabled', String(on));
}

export function setStartOfWeek(day: 0 | 1) {
	settings.startOfWeek = day;
	localStorage.setItem('tohab.startOfWeek', String(day));
}
