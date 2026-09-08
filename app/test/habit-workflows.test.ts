/** Isolated local-storage workflow checks against the Vite dev server; no account or sync. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { launchChrome } from './cdp.ts';

const browser = await launchChrome({ port: 9354, profilePrefix: 'tohab-habit-workflows-' });
const app = process.env.APP ?? 'http://localhost:5173';
const { evaluate, waitFor } = browser;
const click = (text: string) => evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}).click()`);
try {
	await browser.attachPage();
	await browser.navigate(`${app}/habits`);
	await waitFor("document.querySelector('form')");
	await evaluate(`(async () => {
		document.body.innerHTML = '';
		const { mount } = await import('/node_modules/svelte/src/index-client.js');
		const { getDb } = await import('/src/lib/db/lazy.ts');
		const { live } = await import('/src/lib/db/live.svelte.ts');
		const { createHabit, updateHabit, setLog } = await import('/src/lib/habits.ts');
		const { default: Journal } = await import('/src/routes/habits/+page.svelte');
		const { today, shiftKey } = await import('/src/lib/dates.ts');
		window.db = await getDb();
		live.db = window.db;
		window.habit = await createHabit({name:'Read',emoji:'📖',color:'#205fbd',goal:'build',kind:'quantity',target:30,unit:'minutes',scheduleKind:'daily',weekdays:[1,2,3,4,5],timesPerWeek:3});
		window.yesterday = shiftKey(today(), -1);
		await setLog(window.habit, window.yesterday, 30);
		window.archiveHabit = () => updateHabit(window.habit.id, {archived:true});
		mount(Journal, {target:document.body});
	})()`);
	await waitFor("document.querySelector('button[aria-label=\"Edit entry for Read\"]')");
	await evaluate(`document.querySelector('button[aria-label="Edit entry for Read"]').click()`);
	await waitFor("document.querySelector('[role=dialog] input[type=number]')");
	await evaluate(`(() => {const input=document.querySelector('[role=dialog] input[type=number]');input.value='45';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
	await click('Save entry');
	await waitFor("!document.querySelector('[role=dialog]')");
	assert.equal(await evaluate(`(async () => {const {today}=await import('/src/lib/dates.ts'); return (await window.db.habitLogs.findOne(window.habit.id+':'+today()).exec()).value;})()`), 45);
	await evaluate(`document.querySelector('button[aria-label="Previous day"]').click()`);
	await evaluate(`document.querySelector('button[aria-label="Edit entry for Read"]').click()`);
	await waitFor("document.querySelector('[role=dialog] input[type=number]')?.value === '30'");
	for (const width of [390, 1280]) {
		await browser.send('Emulation.setDeviceMetricsOverride', {width,height:844,deviceScaleFactor:1,mobile:width<768});
		await new Promise(resolve => setTimeout(resolve, 250));
		const shot = await browser.send('Page.captureScreenshot', {format:'png'});
		writeFileSync(`/private/tmp/tohab-habit-entry-${width}.png`, Buffer.from(shot.data,'base64'));
	}
	await evaluate(`(() => {const input=document.querySelector('[role=dialog] input[type=number]');input.value='12';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
	await click('Save entry');
	await waitFor("!document.querySelector('[role=dialog]')");
	assert.equal(await evaluate(`(async () => (await window.db.habitLogs.findOne(window.habit.id+':'+window.yesterday).exec()).value)()`), 12);
	await evaluate(`document.querySelector('button[aria-label="Edit entry for Read"]').click()`);
	await waitFor("document.querySelector('[role=dialog] input[type=number]')");
	await evaluate(`(() => {const input=document.querySelector('[role=dialog] input[type=number]');input.value='0';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
	await click('Save entry');
	await waitFor("!document.querySelector('[role=dialog]')");
	assert.equal(await evaluate(`(async () => !!(await window.db.habitLogs.findOne(window.habit.id+':'+window.yesterday).exec()))()`), false);
	await evaluate('window.archiveHabit()');
	await waitFor("!document.querySelector('button[aria-label=\"Edit entry for Read\"]')");
	await click('Archived');
	await waitFor("document.body.innerText.includes('Restore')");
	await click('Restore');
	await waitFor("document.body.innerText.includes('No archived habits.')");
	await click('Journal');
	await waitFor("document.querySelector('button[aria-label=\"Edit entry for Read\"]')");
	assert.equal(await evaluate(`(async () => (await window.db.habits.findOne(window.habit.id).exec()).archived)()`), false);
	console.log('Habit workflows passed: exact today value, historical correction/clear, archive and restore.');
} finally { browser.close(); }
