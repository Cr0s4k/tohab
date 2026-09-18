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
		const { createHabit, deleteHabit, updateHabit, setLog } = await import('/src/lib/habits.ts');
		const { default: Journal } = await import('/src/routes/habits/+page.svelte');
		const { today, shiftKey } = await import('/src/lib/dates.ts');
		window.db = await getDb();
		live.db = window.db;
		window.habit = await createHabit({name:'Read',emoji:'📖',color:'#205fbd',goal:'build',kind:'quantity',target:30,unit:'minutes',scheduleKind:'daily',weekdays:[1,2,3,4,5],timesPerWeek:3,startDate:shiftKey(today(), -1)});
		window.defaultHabit = await createHabit({name:'Default start',emoji:'🗓️',color:'#205fbd',goal:'build',kind:'binary',target:1,unit:'',scheduleKind:'daily',weekdays:[1,2,3,4,5],timesPerWeek:3});
		await deleteHabit(window.defaultHabit.id);
		window.futureHabit = await createHabit({name:'Future',emoji:'🗓️',color:'#205fbd',goal:'build',kind:'binary',target:1,unit:'',scheduleKind:'daily',weekdays:[1,2,3,4,5],timesPerWeek:3,startDate:shiftKey(today(), 3)});
		window.yesterday = shiftKey(today(), -1);
		await setLog(window.habit, window.yesterday, 30);
		await updateHabit(window.habit.id, {target:45});
		window.weeklyHabit = await createHabit({name:'Weekly',emoji:'🗓️',color:'#205fbd',goal:'build',kind:'binary',target:1,unit:'',scheduleKind:'daily',weekdays:[1,2,3,4,5],timesPerWeek:3});
		await updateHabit(window.weeklyHabit.id, {scheduleKind:'weekly',timesPerWeek:3});
		window.archiveHabit = () => updateHabit(window.habit.id, {archived:true});
		mount(Journal, {target:document.body});
	})()`);
	await browser.send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
	await evaluate(`document.querySelector('button[aria-label="New habit"]').click()`);
	await waitFor("document.querySelector('[role=dialog] input[type=\"date\"]')");
	assert.equal(await evaluate(`(async () => {const {today}=await import('/src/lib/dates.ts'); return document.querySelector('[role=dialog] input[type="date"]').value === today();})()`), true);
	for (const width of [390, 1280]) {
		await browser.send('Emulation.setDeviceMetricsOverride', {width,height:844,deviceScaleFactor:1,mobile:width<768});
		await new Promise(resolve => setTimeout(resolve, 250));
		const shot = await browser.send('Page.captureScreenshot', {format:'png'});
		writeFileSync(`/private/tmp/tohab-habit-start-${width}.png`, Buffer.from(shot.data,'base64'));
	}
	await click('Cancel');
	await waitFor("!document.querySelector('[role=dialog]')");
	await waitFor("document.querySelector('button[aria-label=\"Edit entry for Read\"]')");
	assert.deepEqual(
		await evaluate(`Array.from(document.querySelectorAll('header > div:first-child > div:last-child button')).map(button => button.getAttribute('aria-label'))`),
		['Archived habits', 'Switch to Tasks', 'Settings'],
		'archived habits is the first header action'
	);
	assert.equal(await evaluate(`(async () => {const {today}=await import('/src/lib/dates.ts'); return window.defaultHabit.startDate === today();})()`), true);
	assert.equal(await evaluate(`document.body.innerText.includes('Future')`), false);
	assert.equal(await evaluate(`document.body.innerText.includes('0/45')`), true);
	assert.equal(await evaluate(`document.body.innerText.includes('Weekly') && document.body.innerText.includes('Not done yet')`), true);
	assert.equal(await evaluate(`(async () => {const {revisionsQuery}=await import('/src/lib/habits.ts'); const {today,shiftKey,startOfWeekKey}=await import('/src/lib/dates.ts'); const rows=await revisionsQuery(window.db,window.weeklyHabit.id).exec(); const next=shiftKey(startOfWeekKey(today(),1),7); return rows.some(r=>r.effectiveFrom===next && r.scheduleKind==='weekly');})()`), true);
	await evaluate(`document.querySelector('button[aria-label="Edit entry for Read"]').click()`);
	await waitFor("document.querySelector('[role=dialog] input[type=number]')");
	await evaluate(`(() => {const input=document.querySelector('[role=dialog] input[type=number]');input.value='45';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
	await click('Save entry');
	await waitFor("!document.querySelector('[role=dialog]')");
	assert.equal(await evaluate(`(async () => {const {today}=await import('/src/lib/dates.ts'); return (await window.db.habitLogs.findOne(window.habit.id+':'+today()).exec()).value;})()`), 45);
	await evaluate(`document.querySelector('button[aria-label="Previous day"]').click()`);
	await waitFor(`document.body.innerText.includes('1 of 1 done')`);
	assert.equal(
		await evaluate(`document.querySelector('button[aria-label="Edit entry for Read"] circle:nth-of-type(2)')?.getAttribute('stroke-dashoffset') === '0'`),
		true
	);
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
	await waitFor("document.querySelector('[aria-label=\"Entry edited\"]')");
	assert.equal(await evaluate(`Boolean(document.querySelector('[aria-label="Entry edited"]'))`), true);
	await evaluate(`document.querySelector('button[aria-label="Edit entry for Read"]').click()`);
	await waitFor("document.querySelector('[role=dialog] input[type=number]')");
	assert.equal(await evaluate(`document.querySelector('[role=dialog]').innerText.includes('Last changed')`), true);
	await evaluate(`(() => {const input=document.querySelector('[role=dialog] input[type=number]');input.value='0';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
	await click('Save entry');
	await waitFor("!document.querySelector('[role=dialog]')");
	assert.equal(await evaluate(`(async () => !!(await window.db.habitLogs.findOne(window.habit.id+':'+window.yesterday).exec()))()`), false);
	assert.equal(await evaluate(`Boolean(document.querySelector('[aria-label="Entry edited"]'))`), false);
	await evaluate('window.archiveHabit()');
	await waitFor("!document.querySelector('button[aria-label=\"Edit entry for Read\"]')");
	await evaluate(`document.querySelector('button[aria-label="Archived habits"]').click()`);
	await waitFor("document.body.innerText.includes('Restore')");
	await click('Restore');
	await waitFor("document.body.innerText.includes('No archived habits.')");
	await evaluate(`document.querySelector('button[aria-label="Archived habits"]').click()`);
	await waitFor("document.querySelector('button[aria-label=\"Edit entry for Read\"]')");
	assert.equal(await evaluate(`(async () => (await window.db.habits.findOne(window.habit.id).exec()).archived)()`), false);
	// Creating from a past journal date still starts today unless explicitly changed.
	await evaluate(`document.querySelector('button[aria-label="New habit"]').click()`);
	await waitFor("document.querySelector('[role=dialog] input[type=date]')");
	assert.equal(await evaluate(`(async () => {const {today}=await import('/src/lib/dates.ts');return document.querySelector('[role=dialog] input[type=date]').value===today();})()`), true);
	await click('Cancel');
	await waitFor("!document.querySelector('[role=dialog]')");
	// A pending weekly edit is visible in the editor, including its effective date.
	await evaluate(`(async () => {
		const {mount}=await import('/node_modules/svelte/src/index-client.js');
		const {default:Editor}=await import('/src/lib/components/HabitEditor.svelte');
		const {revisionsQuery,withHabitHistory}=await import('/src/lib/habits.ts');
		const habit=(await window.db.habits.findOne(window.weeklyHabit.id).exec()).toMutableJSON();
		const revisions=(await revisionsQuery(window.db,habit.id).exec()).map(r=>r.toMutableJSON());
		window.editorMount=mount(Editor,{target:document.body,props:{open:true,habit:withHabitHistory(habit,revisions),onClose:()=>{}}});
	})()`);
	await waitFor("[...document.querySelectorAll('[role=dialog] button')].some(b=>b.textContent.trim()==='3' && b.getAttribute('aria-pressed')==='true')");
	await click('4');
	await waitFor("document.querySelector('[role=dialog]').innerText.includes('Tracking changes take effect')");
	assert.equal(await evaluate(`(async () => {const {today,shiftKey,startOfWeekKey,humanDay}=await import('/src/lib/dates.ts');return document.querySelector('[role=dialog]').innerText.includes('Tracking changes take effect '+humanDay(shiftKey(startOfWeekKey(today(),1),7)));})()`), true);
	await click('Save changes');
	await waitFor(`(async () => {const {revisionsQuery}=await import('/src/lib/habits.ts');return (await revisionsQuery(window.db,window.weeklyHabit.id).exec()).some(r=>r.timesPerWeek===4);})()`);
	await evaluate(`(async () => {const {unmount}=await import('/node_modules/svelte/src/index-client.js');await unmount(window.editorMount);})()`);
	await evaluate(`(async () => {
		const {mount}=await import('/node_modules/svelte/src/index-client.js');
		const {default:Progress}=await import('/src/routes/progress/+page.svelte');
		const {default:Heatmap}=await import('/src/lib/components/Heatmap.svelte');
		window.progressRoot=document.createElement('section');document.body.append(window.progressRoot);
		mount(Progress,{target:window.progressRoot});
		window.heatmapRoot=document.createElement('section');document.body.append(window.heatmapRoot);
		mount(Heatmap,{target:window.heatmapRoot,props:{habit:window.habit,logs:new Map(),onToggleDay:()=>{}}});
	})()`);
	await waitFor("window.progressRoot.innerText.includes('Future') && window.progressRoot.innerText.includes('Starts')");
	assert.equal(await evaluate(`(() => {const days=[...window.heatmapRoot.querySelectorAll('button[aria-label*="before this habit starts"]')];return days.length>0 && days.every(day=>day.disabled);})()`), true);
	console.log('Habit workflows passed: start dates, historical targets, pending weekly edits, future Progress, heatmap boundaries, logging and archive/restore.');
} finally { browser.close(); }
