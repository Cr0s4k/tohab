import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { launchChrome } from './cdp.ts';

// Uses the Vite dev server, like the other component browser tests.
const browser = await launchChrome({ port: 9353, profilePrefix: 'tohab-quick-capture-' });
const active = 'document.querySelector(\'[role="dialog"][aria-modal="true"]\')';

async function clickButton(label: string) {
	await browser.evaluate(`(() => {
		const button = [...${active}.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(label)});
		if (!button) throw new Error('Missing button: ' + ${JSON.stringify(label)});
		button.focus();
		button.click();
	})()`);
}

async function key(key: string, modifiers = 0) {
	await browser.send('Input.dispatchKeyEvent', {
		type: 'keyDown', key, code: key, modifiers,
		windowsVirtualKeyCode: key === 'Escape' ? 27 : 9
	});
	await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, modifiers });
}

async function composerActive() {
	await browser.waitFor(`${active}?.querySelector('h2')?.textContent === 'Quick capture' && document.querySelectorAll('[role="dialog"]').length === 1`);
}

try {
	await browser.attachPage();
	await browser.navigate(process.env.APP ?? 'http://127.0.0.1:5183/');
	await browser.evaluate(`(async () => {
		const { mount } = await import('/node_modules/svelte/src/index-client.js');
		const { default: Fixture } = await import('/test/QuickCaptureFixture.svelte');
		await import('/src/app.css');
		document.body.innerHTML = '';
		mount(Fixture, { target: document.body });
	})()`);

	for (const width of [390, 1280]) {
		await browser.send('Emulation.setDeviceMetricsOverride', {
			width, height: 844, deviceScaleFactor: 1, mobile: width < 768
		});
		await browser.evaluate(`document.documentElement.dataset.theme = '${width < 768 ? 'light' : 'dark'}'`);
		await browser.evaluate(`document.querySelector('[aria-label="Add task"]').focus(); document.activeElement.click()`);
		await composerActive();
		await browser.waitFor(`document.activeElement?.getAttribute('aria-label') === 'Quick add task'`);
		await browser.evaluate(`(() => {
			const input = document.activeElement;
			input.value = 'Stacked capture ${width} tomorrow !!2';
			input.dispatchEvent(new Event('input', { bubbles: true }));
		})()`);

		for (const [index, title] of ['Date', 'Repeat', 'Priority', 'Project', 'Reminders'].entries()) {
			await browser.evaluate(`(() => {
				window.composer = ${active};
				window.captureInput = window.composer.querySelector('input');
				window.trigger = window.composer.querySelectorAll('[aria-haspopup="dialog"]')[${index}];
				window.baseRect = window.composer.getBoundingClientRect().toJSON();
				window.trigger.focus();
				window.trigger.click();
			})()`);
			await browser.waitFor(`${active}?.querySelector('h2')?.textContent === '${title}' && ${active}.contains(document.activeElement)`);
			assert.equal(await browser.evaluate('document.querySelectorAll(\'[role="dialog"]\').length'), 2);
			assert.equal(await browser.evaluate(`window.composer.closest('[inert]')?.getAttribute('aria-hidden')`), 'true');
			assert.equal(await browser.evaluate(`${active}.contains(window.composer)`), false);
			assert.equal(await browser.evaluate(`window.composer.querySelector('input') === window.captureInput`), true);
			assert.equal(await browser.evaluate('window.trigger.getAttribute("aria-expanded")'), 'true');
			assert.deepEqual(await browser.evaluate('window.composer.getBoundingClientRect().toJSON()'), await browser.evaluate('window.baseRect'));
			assert.equal(await browser.evaluate(`new Set([...document.querySelectorAll('[role="dialog"]')].map(dialog => dialog.getAttribute('aria-labelledby'))).size`), 2);
			assert.equal(await browser.evaluate(`document.getElementById(${active}.getAttribute('aria-labelledby')).textContent`), title);

			// Keyboard traversal stays in the upper dialog in both directions.
			await browser.evaluate(`${active}.querySelector('button').focus()`);
			await key('Tab', 8);
			assert.equal(await browser.evaluate(`${active}.contains(document.activeElement)`), true);
			await key('Tab');
			assert.equal(await browser.evaluate(`document.activeElement === ${active}.querySelector('button')`), true);

			if (title === 'Date') {
				await browser.evaluate(`(() => {
					for (const [label, value] of [['Due date', '2099-06-15'], ['Due time', '12:30']]) {
						const input = ${active}.querySelector('[aria-label="' + label + '"]');
						input.value = value;
						input.dispatchEvent(new Event('change', { bubbles: true }));
					}
				})()`);
			} else if (title === 'Repeat') {
				await clickButton('Daily');
			} else if (title === 'Priority') {
				await browser.evaluate(`${active}.querySelectorAll('[aria-pressed]')[0].click()`);
			} else if (title === 'Project') {
				// The touch guard must allow the upper sheet's scroller, never its veil or the composer.
				assert.deepEqual(await browser.evaluate(`(() => {
					const pane = ${active};
					return [pane, pane.previousElementSibling, window.composer].map(target => {
						const event = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [new Touch({ identifier: 1, target })] });
						target.dispatchEvent(event);
						return event.defaultPrevented;
					});
				})()`), [false, true, true]);
				await clickButton('Project 3');
			} else {
				await clickButton('Custom…');
				assert.deepEqual(await browser.evaluate('window.composer.getBoundingClientRect().toJSON()'), await browser.evaluate('window.baseRect'));
				await clickButton('Cancel');
				await clickButton('In 1 hour');
				await clickButton('10 min before');
				const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
				writeFileSync(`/private/tmp/tohab-quick-capture-${width}.png`, Buffer.from(shot.data, 'base64'));
			}

			if (index === 1) await key('Escape');
			else if (index === 2) await browser.evaluate(`${active}.previousElementSibling.click()`);
			else await clickButton('Done');
			await composerActive();
			assert.equal(await browser.evaluate('document.activeElement === window.trigger'), true, `${title} restores shortcut focus`);
			assert.equal(await browser.evaluate('window.trigger.getAttribute("aria-expanded")'), 'false');
			assert.equal(await browser.evaluate('document.documentElement.hasAttribute("data-scroll-locked")'), true);
		}

		await browser.evaluate(`${active}.querySelector('[aria-label="Add task"]').click()`);
		await browser.waitFor('window.captureInput.value === "" && document.activeElement === window.captureInput');
		const task = await browser.evaluate<Record<string, unknown>>(`(async () => {
			const { getDb } = await import('/src/lib/db/index.ts');
			const db = await getDb();
			return (await db.tasks.findOne({ selector: { title: 'Stacked capture ${width}' } }).exec())?.toJSON();
		})()`);
		assert.ok(task, 'task is persisted');
		assert.equal(task.due, '2099-06-15');
		assert.equal(task.dueTime, '12:30');
		assert.equal(task.priority, 1, 'picker overrides parsed priority');
		assert.equal(task.repeat, 'day:1');
		assert.equal(task.projectId, 'project-3');
		assert.equal(task.reminderMinutes, 10);
		assert.equal((task.reminders as string[]).length, 1);
		await key('Escape');
		await browser.waitFor('!document.querySelector(\'[role="dialog"]\')');
		assert.equal(await browser.evaluate('document.activeElement?.getAttribute("aria-label")'), 'Add task');
		assert.equal(await browser.evaluate('document.documentElement.hasAttribute("data-scroll-locked")'), false);
	}
	console.log('Quick capture stacked modal assertions passed (mobile and desktop)');
} finally {
	browser.close();
}
