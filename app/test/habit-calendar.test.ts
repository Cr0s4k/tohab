/** Real habit route and local RxDB; requires the Vite dev server, no account or sync. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { launchChrome } from './cdp.ts';

const app = process.env.APP ?? 'http://localhost:5173';
const browser = await launchChrome({ port: 9365, profilePrefix: 'tohab-habit-calendar-' });
const { evaluate, waitFor } = browser;

try {
	await browser.attachPage();
	await browser.navigate(`${app}/habits`);
	await waitFor("document.querySelector('form')");
	await evaluate(`(async () => {
		const { settings } = await import('/src/lib/settings.svelte.ts');
		const { auth } = await import('/src/lib/auth.svelte.ts');
		settings.syncEnabled = false;
		auth.session = { userId: 'habit-calendar-test', email: 'calendar@example.com' };
	})()`);
	await waitFor('document.querySelector(\'button[aria-label="New habit"]\')');
	await evaluate(`(async () => {
		const { createHabit, setLog, updateHabit } = await import('/src/lib/habits.ts');
		const { today, shiftKey } = await import('/src/lib/dates.ts');
		window.calendarHabit = await createHabit({
			name: 'Calendar history', emoji: '📖', color: '#205fbd', goal: 'build',
			kind: 'quantity', target: 30, unit: 'minutes', scheduleKind: 'daily',
			weekdays: [1, 2, 3, 4, 5], timesPerWeek: 3, startDate: shiftKey(today(), -90)
		});
		for (let i = 0; i < 10; i++) {
			await setLog(window.calendarHabit, shiftKey(today(), -i), i % 2 ? 15 : 30);
		}
		await updateHabit(window.calendarHabit.id, { target: 45 });
	})()`);
	await waitFor('document.querySelector(\'a[href="/habits/\' + window.calendarHabit.id + \'"]\')');
	await evaluate('document.querySelector(\'a[href="/habits/\' + window.calendarHabit.id + \'"]\').click()');
	await waitFor('document.querySelector(\'button[aria-label="Today: 30 of 45"]\')');

	for (const width of [390, 320, 1280]) {
		await browser.send('Emulation.setDeviceMetricsOverride', {
			width, height: 600, deviceScaleFactor: 1, mobile: width < 768
		});
		await browser.send('Emulation.setTouchEmulationEnabled', { enabled: width < 768 });
		for (const theme of ['light', 'dark']) {
			await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
			await waitFor(`(() => {
				const day = document.querySelector('button[aria-label="Today: 30 of 45"]');
				const bounds = day.getBoundingClientRect();
				const main = document.querySelector('main').getBoundingClientRect();
				return bounds.left >= main.left && bounds.right <= main.right;
			})()`, 3000, `recent calendar entries visible at ${width}px`);
			const calendar = await evaluate<any>(`(() => {
				const day = document.querySelector('button[aria-label="Today: 30 of 45"]');
				const yesterday = document.querySelector('button[aria-label="Yesterday: 15 of 30"]');
				const weeks = day.parentElement.parentElement;
				const labels = weeks.previousElementSibling.children;
				const firstWeek = weeks.firstElementChild.children;
				return {
					count: weeks.querySelectorAll('button').length,
					dayWidth: day.getBoundingClientRect().width,
					dayHeight: day.getBoundingClientRect().height,
					aligned: [...labels].every((label, i) => Math.abs(
						label.getBoundingClientRect().y - firstWeek[i].getBoundingClientRect().y
					) < 1),
					historicalTarget: !!yesterday,
					filled: getComputedStyle(day).backgroundColor !== getComputedStyle(firstWeek[0]).backgroundColor,
					futureDisabled: [...weeks.querySelectorAll('button')].filter(button =>
						button.ariaLabel.startsWith('Tomorrow:')
					).every(button => button.disabled),
					pageFits: document.querySelector('main').scrollWidth === document.querySelector('main').clientWidth
				};
			})()`);
			assert.equal(calendar.count, 84, 'all twelve weeks render');
			assert.equal(calendar.aligned, true, 'weekday labels align with the actual day cells');
			assert.equal(calendar.historicalTarget, true, 'history uses the target in effect on that day');
			assert.equal(calendar.filled, true, 'stored entries have a visible fill');
			assert.equal(calendar.futureDisabled, true, 'future days cannot be edited');
			assert.equal(calendar.pageFits, true, 'calendar overflow stays inside its own scroller');
			if (width < 768) {
				assert.ok(calendar.dayWidth >= 44 && calendar.dayHeight >= 44, 'touch targets are preserved');
			}
			assert.equal(await evaluate(`(() => {
				const main = document.querySelector('main');
				const header = document.querySelector('header');
				const headerTop = header.getBoundingClientRect().top;
				main.scrollTop = main.scrollHeight;
				const last = [...main.querySelectorAll('section')].at(-1).getBoundingClientRect();
				return main.scrollTop > 0 && last.bottom <= main.getBoundingClientRect().bottom &&
					header.getBoundingClientRect().top === headerTop &&
					main.clientWidth === main.parentElement.clientWidth;
			})()`), true, 'full-width content scrolls to the last entry while the header stays fixed');
			await evaluate('document.querySelector(\'button[aria-label="Today: 30 of 45"]\').scrollIntoView({ block: "center" })');
			const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
			writeFileSync(`/private/tmp/tohab-5-calendar-${width}-${theme}.png`, Buffer.from(shot.data, 'base64'));
		}
	}

	// Editing through the calendar must update both the persisted entry and the live cell.
	await evaluate('document.querySelector(\'button[aria-label="Today: 30 of 45"]\').click()');
	await waitFor('document.querySelector(\'[role="dialog"] input[type="number"]\')');
	await evaluate(`(() => {
		const input = document.querySelector('[role="dialog"] input[type="number"]');
		input.value = '45';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Save entry').click();
	})()`);
	await waitFor('!document.querySelector(\'[role="dialog"]\') && document.querySelector(\'button[aria-label="Today: 45 of 45"]\')');
	assert.equal(await evaluate(`(async () => {
		const { live } = await import('/src/lib/db/live.svelte.ts');
		const { today } = await import('/src/lib/dates.ts');
		return (await live.db.habitLogs.findOne(window.calendarHabit.id + ':' + today()).exec()).value;
	})()`), 45);
	assert.equal(await evaluate('document.documentElement.hasAttribute("data-scroll-locked")'), false, 'closing the editor releases scrolling');
	console.log('Habit calendar passed: visible history, historical targets, live edits, touch sizing, label alignment and full-width scrolling.');
} finally {
	browser.close();
}
