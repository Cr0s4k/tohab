import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { launchChrome } from './cdp.ts';

const browser = await launchChrome({ port: 9354, profilePrefix: 'tohab-reminders-' });
const click = async (label: string) => {
	await browser.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
};
try {
	await browser.attachPage();
	await browser.send('Page.navigate', { url: process.env.APP ?? 'http://127.0.0.1:5173/' });
	await browser.waitFor("document.querySelector('form')");
	await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
	await browser.evaluate(`(async () => {
		const { mount, unmount } = await import('/node_modules/svelte/src/index-client.js');
		const { default: Compose } = await import('/src/lib/components/TaskCompose.svelte');
		const { default: Editor } = await import('/src/lib/components/TaskEditor.svelte');
		const { getDb } = await import('/src/lib/db/index.ts');
		const { live } = await import('/src/lib/db/live.svelte.ts');
		document.body.innerHTML = '<main></main>';
		localStorage.setItem('tohab.dbName', 'reminderbrowser');
		window.db = await getDb();
		live.db = window.db;
		window.target = document.querySelector('main');
		window.component = mount(Compose, { target: window.target, props: { open: true, projects: [], onClose: () => { window.reminderClosed = true; } } });
		window.openEditor = async () => {
			await unmount(window.component);
			window.target.replaceChildren();
			window.reminderClosed = false;
			window.task = (await window.db.tasks.find().exec())[0].toMutableJSON();
			window.component = mount(Editor, { target: window.target, props: { task: window.task, projects: [], onClose: () => { window.reminderClosed = true; } } });
		};
	})()`);
	await browser.waitFor("document.querySelector('input[aria-label=\"Quick add task\"]')");
	await browser.evaluate(`(() => {
		const input = document.querySelector('input[aria-label="Quick add task"]');
		input.value = 'Buy groceries'; input.dispatchEvent(new Event('input', { bubbles: true }));
	})()`);
	await click('Reminders');
	await browser.waitFor("document.body.innerText.includes('Tomorrow · 9 AM')");
	await click('Tomorrow · 9 AM');
	await browser.waitFor("document.querySelectorAll('[aria-label=\"Custom reminders\"] li').length === 1");
	await browser.evaluate(`document.querySelector('button[aria-label="Add task"]').click()`);
	await browser.waitFor('window.reminderClosed');
	const task = await browser.evaluate<any>('(async () => (await window.db.tasks.find().exec())[0].toMutableJSON())()');
	assert.equal(task.due, '');
	assert.equal(task.dueTime, '');
	assert.equal(task.reminders.length, 1);
	assert.match(task.reminders[0], /T09:00$/);
	await browser.evaluate('window.openEditor()');
	await browser.waitFor("document.querySelector('[aria-label=\"Custom reminders\"]')");
	await click('Custom…');
	await browser.waitFor("document.querySelector('input[type=time]')");
	await browser.evaluate(`(() => {
		const inputs = [...document.querySelectorAll('input[type=date]')];
		const input = inputs[inputs.length - 1];
		input.value = '2020-01-01'; input.dispatchEvent(new Event('input', { bubbles:true }));
	})()`);
	await click('Add reminder');
	await browser.waitFor("document.querySelector('[role=alert]')");
	assert.match(await browser.evaluate<string>("document.querySelector('[role=alert]').textContent"), /future/);
	await click('Cancel');
	await click('In 1 hour');
	await browser.waitFor("document.querySelectorAll('[aria-label=\"Custom reminders\"] li').length === 2");
	for (const [width, height, theme] of [[390, 844, 'light'], [1280, 900, 'dark']] as const) {
		await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
		await browser.evaluate(`document.documentElement.dataset.theme = '${theme}'`);
		await browser.evaluate(`document.querySelector('[aria-label="Custom reminders"]').scrollIntoView({ block: 'center' })`);
		assert.equal(await browser.evaluate<boolean>('document.documentElement.scrollWidth <= innerWidth'), true);
		const capture = await browser.send('Page.captureScreenshot', { format: 'png' });
		writeFileSync(`/private/tmp/tohab-reminders-${width}.png`, Buffer.from(capture.data, 'base64'));
	}
	await click('Save');
	await browser.waitFor('window.reminderClosed');
	await browser.evaluate('window.openEditor()');
	await browser.waitFor("document.querySelectorAll('[aria-label=\"Custom reminders\"] li').length === 2");
	await click('Remove');
	await click('Save');
	await browser.waitFor('window.reminderClosed');
	assert.equal(await browser.evaluate<number>('(async () => (await window.db.tasks.find().exec())[0].reminders.length)()'), 1);
	console.log('ok reminder creation, editor persistence, validation, removal, mobile and desktop layout');
} finally {
	browser.close();
}
