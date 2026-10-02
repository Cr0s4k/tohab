import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../src/app.html');
const watchdog = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)![1];

function boot(splashPresent: boolean, leaving = false, error = '') {
	const nodes: Record<string, any> = {
		'splash': splashPresent ? { hasAttribute: () => leaving } : null,
		'splash-recovery': { hidden: true },
		'splash-details': { hidden: true },
		'splash-error': { textContent: '' }
	};
	const listeners = new Map<string, (event: any) => void>();
	let timeout: () => void = () => {};
	runInNewContext(watchdog, {
		window: {
			addEventListener: (name: string, fn: (event: any) => void) => listeners.set(name, fn),
			removeEventListener: (name: string) => listeners.delete(name)
		},
		document: { getElementById: (id: string) => nodes[id] },
		setTimeout: (fn: () => void) => { timeout = fn; }
	});
	if (error) listeners.get('unhandledrejection')!({ reason: new Error(error) });
	timeout();
	assert.equal(listeners.size, 0);
	return nodes;
}

assert.equal(boot(true)['splash-recovery'].hidden, false, 'a stalled bundle offers recovery without mounting Svelte');
const failed = boot(true, false, 'Module failed <script>');
assert.equal(failed['splash-error'].textContent, 'Module failed <script>', 'errors are rendered as text');
assert.equal(failed['splash-details'].hidden, false);
assert.equal(boot(false)['splash-recovery'].hidden, true, 'successful startup is untouched');
assert.equal(boot(true, true)['splash-recovery'].hidden, true, 'a departing splash stays dismissed');

function loadSettings(storage: object) {
	const source = read('../src/lib/settings.svelte.ts').replace("import { browser } from '$app/env';", 'const browser = true;');
	const exports: Record<string, any> = {};
	runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
		exports, $state: (value: unknown) => value, localStorage: storage
	});
	return exports.settings;
}
const denied = loadSettings({ getItem() { throw new Error('Storage denied'); } });
assert.equal(denied.theme, 'system');
assert.equal(denied.reminderMinutes, 10);
assert.equal(loadSettings({ getItem: (key: string) => key === 'tohab.reminderMinutes' ? '0' : null }).reminderMinutes, -1);
assert.equal(loadSettings({ getItem: (key: string) => key === 'tohab.automaticReminderMinutes' ? '0' : null }).reminderMinutes, 0);
console.log('startup recovery tests passed');
