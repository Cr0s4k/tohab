import { browser } from '$app/environment';

export type Theme = 'system' | 'light' | 'dark';

function read(key: string, fallback: string): string {
	if (!browser) return fallback;
	return localStorage.getItem(key) ?? fallback;
}

export const settings = $state({
	theme: read('tohab.theme', 'system') as Theme,
	serverUrl: read('tohab.serverUrl', '/sync'),
	syncEnabled: read('tohab.syncEnabled', 'true') === 'true',
	startOfWeek: Number(read('tohab.startOfWeek', '1')) as 0 | 1,
	/** Minutes before a timed task that the calendar feed's alarm fires. 0 is off. */
	reminderMinutes: Number(read('tohab.reminderMinutes', '10')),
	sidebarCollapsed: read('tohab.sidebarCollapsed', 'false') === 'true',
	sound: read('tohab.sound', 'true') === 'true'
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

export function setReminderMinutes(minutes: number) {
	settings.reminderMinutes = minutes;
	localStorage.setItem('tohab.reminderMinutes', String(minutes));
}

export function setStartOfWeek(day: 0 | 1) {
	settings.startOfWeek = day;
	localStorage.setItem('tohab.startOfWeek', String(day));
}

export function setSound(on: boolean) {
	settings.sound = on;
	localStorage.setItem('tohab.sound', String(on));
}

export function setSidebarCollapsed(collapsed: boolean) {
	settings.sidebarCollapsed = collapsed;
	localStorage.setItem('tohab.sidebarCollapsed', String(collapsed));
}
