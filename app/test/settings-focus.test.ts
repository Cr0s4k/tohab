import assert from 'node:assert/strict';
import { launchChrome } from './cdp.ts';

const browser = await launchChrome({ port: 9368, profilePrefix: 'tohab-settings-focus-' });

try {
	await browser.attachPage();
	await browser.send('Page.navigate', { url: process.env.APP ?? 'http://localhost:5173/' });
	await new Promise((resolve) => setTimeout(resolve, 500));
	await browser.evaluate(`(async () => {
		const { mount, createRawSnippet } = await import('/node_modules/svelte/src/index-client.js');
		const { default: Sheet } = await import('/src/lib/components/Sheet.svelte');
		document.body.innerHTML = '<main></main>';
		mount(Sheet, {
			target: document.querySelector('main'),
			props: {
				open: true,
				title: 'Settings',
				focusTarget: 'dialog',
				onClose: () => {},
				children: createRawSnippet(() => ({ render: () => '<p>Settings content</p>' }))
			}
		});
	})()`);
	await browser.waitFor(`document.querySelector('[role="dialog"]') === document.activeElement`, 5000, 'settings dialog receives initial focus');
	assert.equal(await browser.evaluate(`document.activeElement.querySelector('button') === document.activeElement`), false);
	assert.equal(await browser.evaluate(`getComputedStyle(document.activeElement).outlineStyle`), 'none');

	await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
	await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
	await browser.waitFor(`document.activeElement === document.querySelector('[role="dialog"] button')`, 5000, 'Tab enters settings controls');
	console.log('Settings focus assertions passed');
} finally {
	browser.close();
}
