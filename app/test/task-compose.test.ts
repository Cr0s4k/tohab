/** Run against a dev server: APP=http://127.0.0.1:5182 pnpm --filter app test:compose. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome } from './cdp.ts';

const browser = await launchChrome({ port: 9362, profilePrefix: 'tohab-compose-' });
const { evaluate, send, waitFor } = browser;
const input = 'document.querySelector("input[aria-label=\"Quick add task\"]")';
const dialog = 'document.querySelector("[role=dialog]")';

async function key(key: string, code: number, modifiers = 0) {
	await send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: code, modifiers });
	await send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: code, modifiers });
}

try {
	await browser.attachPage();
	await browser.navigate(process.env.APP ?? 'http://localhost:5173/');
	await waitFor("document.querySelector('form')");
	await send('Emulation.setEmulatedMedia', {
		features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
	});
	await evaluate(`(async () => {
		const { mount, unmount, createRawSnippet } = await import('/node_modules/svelte/src/index-client.js');
		const { default: Compose } = await import('/src/lib/components/TaskCompose.svelte');
		const { default: Sheet } = await import('/src/lib/components/Sheet.svelte');
		const { getDb } = await import('/src/lib/db/index.ts');
		const { live } = await import('/src/lib/db/live.svelte.ts');
		document.body.innerHTML = '<button id="opener">New task</button><main></main>';
		localStorage.setItem('tohab.dbName', 'composebrowser');
		window.db = await getDb();
		live.db = window.db;
		const target = document.querySelector('main');
		const onClose = () => unmount(window.component);
		window.openCompose = () => {
			document.querySelector('#opener').focus();
			window.component = mount(Compose, { target, props: { open: true, onClose } });
		};
		window.openDefaultSheet = () => {
			window.component = mount(Sheet, { target, props: {
				open: true, title: 'Other sheet', onClose,
				children: createRawSnippet(() => ({ render: () => '<p>Other content</p>' }))
			} });
		};
	})()`);

	for (const [width, height, theme] of [[390, 844, 'light'], [1280, 900, 'dark']] as const) {
		await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
		// Exercise the CSS environment value that produces the extra inset on iOS.
		await send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 34 } });
		await evaluate(`document.documentElement.dataset.theme = '${theme}'; window.openCompose()`);
		await waitFor(`${input} === document.activeElement`);
		assert.equal(await evaluate(`${dialog}.getAttribute('aria-modal')`), 'true');
		assert.equal(await evaluate(`document.getElementById(${dialog}.getAttribute('aria-labelledby')).textContent`), 'Add task');
		assert.equal(await evaluate(`${dialog}.innerText.includes('Quick capture') || ${dialog}.innerText.includes('Done')`), false);
		assert.equal(await evaluate(`getComputedStyle(${dialog}).paddingBottom`), '0px');
		assert.equal(await evaluate(`getComputedStyle(${dialog}.lastElementChild).paddingBottom`), '0px');
		assert.equal(await evaluate(`getComputedStyle(${dialog}).borderTopLeftRadius`), '24px');
		if (width >= 768) {
			assert.equal(await evaluate(`getComputedStyle(${dialog}).borderBottomLeftRadius`), '24px');
		}
		assert.equal(await evaluate(`${dialog}.scrollWidth <= ${dialog}.clientWidth`), true);
		assert.equal(await evaluate("document.querySelector('button[aria-label=\"Add task\"]').disabled"), true);
		assert.equal(await evaluate("document.documentElement.hasAttribute('data-scroll-locked')"), true);

		await key('Tab', 9, 8);
		assert.equal(await evaluate('document.activeElement.textContent.trim()'), 'Reminders', 'Shift+Tab wraps to the last control');
		await key('Tab', 9);
		assert.equal(await evaluate(`${input} === document.activeElement`), true, 'Tab wraps back to the task input');
		await send('Input.insertText', { text: `Capture ${width} tomorrow !!1` });
		await waitFor(`${dialog}.innerText.includes('Tomorrow') && ${dialog}.innerText.includes('P1')`);
		await key('Enter', 13);
		await waitFor(`${input}?.value === '' && ${input} === document.activeElement`);
		assert.equal(await evaluate(`(async () => (await window.db.tasks.find().exec()).filter(task => task.title === 'Capture ${width}' && task.priority === 1).length)()`), 1, 'Enter saves once and refocuses for another task');

		if (process.env.SCREENSHOT_DIR) {
			const capture = await send('Page.captureScreenshot', { format: 'png' });
			writeFileSync(join(process.env.SCREENSHOT_DIR, `tohab-2-${width}.png`), Buffer.from(capture.data, 'base64'));
		}
		await key('Escape', 27);
		await waitFor(`!${dialog}`);
		assert.equal(await evaluate('document.activeElement.id'), 'opener', 'Escape restores focus');
		assert.equal(await evaluate("document.documentElement.hasAttribute('data-scroll-locked')"), false);
		await evaluate('window.openCompose()');
		await waitFor(`${input} === document.activeElement`);
		await evaluate("document.querySelector('button[aria-label=\"Close dialog\"]').click()");
		await waitFor(`!${dialog}`);
		assert.equal(await evaluate('document.activeElement.id'), 'opener', 'Close button restores focus');
	}

	await evaluate('window.openDefaultSheet()');
	await waitFor(dialog);
	assert.equal(await evaluate(`getComputedStyle(${dialog}).paddingBottom`), '34px', 'Other sheets retain the safe-area inset');
	assert.equal(await evaluate(`${dialog}.querySelector('button').textContent`), 'Done');
	await key('Escape', 27);
	await waitFor(`!${dialog}`);
	console.log('Task compose: layout, safe-area spacing, keyboard submission, focus and dismissal passed');
} finally {
	browser.close();
}
