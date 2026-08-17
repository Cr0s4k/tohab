import { browser } from '$app/environment';
import { STORAGE_PREFIX, defaultOptions, type ViewOptions } from './viewOptions.ts';

export * from './viewOptions.ts';

function loadAll(): Record<string, ViewOptions> {
	const all: Record<string, ViewOptions> = {};
	if (!browser) return all;
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (!key?.startsWith(STORAGE_PREFIX)) continue;
		const scope = key.slice(STORAGE_PREFIX.length);
		try {
			all[scope] = { ...defaultOptions(scope), ...JSON.parse(localStorage.getItem(key) ?? '') };
		} catch {
			/* corrupt entry falls back to defaults */
		}
	}
	return all;
}

const stored = $state<Record<string, ViewOptions>>(loadAll());

export function viewOptions(scope: string): ViewOptions {
	return stored[scope] ?? defaultOptions(scope);
}

export function isCustomised(scope: string): boolean {
	const current = viewOptions(scope);
	const base = defaultOptions(scope);
	return (Object.keys(base) as (keyof ViewOptions)[]).some((k) => current[k] !== base[k]);
}

export function setViewOptions(scope: string, patch: Partial<ViewOptions>) {
	const next = { ...viewOptions(scope), ...patch };
	stored[scope] = next;
	if (browser) localStorage.setItem(STORAGE_PREFIX + scope, JSON.stringify(next));
}

export function resetViewOptions(scope: string) {
	delete stored[scope];
	if (browser) localStorage.removeItem(STORAGE_PREFIX + scope);
}
