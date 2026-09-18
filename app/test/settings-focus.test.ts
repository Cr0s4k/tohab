import assert from 'node:assert/strict';
import { launchChrome } from './cdp.ts';

const browser = await launchChrome({ port: 9368, profilePrefix: 'tohab-settings-focus-' });

try {
	await browser.attachPage();
	await browser.send('Page.navigate', { url: process.env.APP ?? 'http://localhost:5173/' });
	await new Promise((resolve) => setTimeout(resolve, 500));
	await browser.evaluate(`(async () => {
		const source = await (await fetch('/src/lib/components/Sheet.svelte')).text();
		const runtime = source.split('from "').map((part) => part.split('"')[0]).find((path) => path.includes('/svelte.js'));
		const { mount, unmount, createRawSnippet } = await import(runtime);
		const { setTheme } = await import('/src/lib/settings.svelte.ts');
		setTheme('light');
		const { default: Sheet } = await import('/src/lib/components/Sheet.svelte');
		document.body.innerHTML = '<main></main>';
		const instance = mount(Sheet, {
			target: document.querySelector('main'),
			props: {
				open: true,
				title: 'Settings',
				focusTarget: 'dialog',
				onClose: () => {},
				children: createRawSnippet(() => ({ render: () => '<p>Settings content</p>' }))
			}
		});
		window.closeTestSheet = () => unmount(instance, { outro: true });
	})()`);
	await browser.waitFor(`document.querySelector('[role="dialog"]') === document.activeElement`, 5000, 'settings dialog receives initial focus');
	assert.equal(await browser.evaluate(`document.activeElement.querySelector('button') === document.activeElement`), false);
	assert.equal(await browser.evaluate(`getComputedStyle(document.activeElement).outlineStyle`), 'none');

	await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
	await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
	await browser.waitFor(`document.activeElement === document.querySelector('[role="dialog"] button')`, 5000, 'Tab enters settings controls');
	await browser.waitFor(`document.querySelector('meta[name="theme-color"]').content === '#8b8a88'`, 5000, 'PWA bar matches the light backdrop');
	await browser.evaluate(`(async () => {
		const { setTheme } = await import('/src/lib/settings.svelte.ts');
		setTheme('dark');
	})()`);
	assert.equal(await browser.evaluate(`document.querySelector('meta[name="theme-color"]').content`), '#111111');
	await browser.evaluate(`window.closeTestSheet()`);
	await browser.waitFor(`document.querySelector('meta[name="theme-color"]').content === '#1f1f1f'`, 5000, 'PWA bar restores after closing');
	console.log('Settings focus assertions passed');
} finally {
	browser.close();
}
