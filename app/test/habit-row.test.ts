import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { currentStreak, valueOn, type LogMap } from '../src/lib/streaks.ts';
import type { Habit } from '../src/lib/db/schemas.ts';

const selectedDay = '2026-09-18';
const habit: Habit = {
	id: 'break-habit', name: 'Avoid slips', emoji: '🚭', color: '#666666',
	goal: 'break', kind: 'quantity', target: 0, unit: '',
	scheduleKind: 'daily', weekdays: [], timesPerWeek: 1, archived: false,
	startDate: '2026-09-17', createdAt: Date.UTC(2026, 8, 17), updatedAt: 0
};
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
	const { default: HabitRow } = await server.ssrLoadModule('/src/lib/components/HabitRow.svelte');
	const { render } = await server.ssrLoadModule('svelte/server');
	function row(current: Habit, logs: LogMap) {
		const streak = currentStreak(current, logs, 1, selectedDay);
		const { body } = render(HabitRow, {
			props: { habit: current, value: valueOn(logs, selectedDay), streak, onTap() {} }
		});
		return { streak, text: body.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() };
	}

	for (const value of [1, 3]) {
		const failed = row(habit, new Map([['2026-09-17', 0], [selectedDay, value]]));
		assert.equal(failed.streak, 1, 'the previous clean day still contributes to the streak helper');
		assert.ok(failed.text.includes(`${value} ${value === 1 ? 'slip' : 'slips'} today`), failed.text);
		assert.ok(!failed.text.includes('🔥'), failed.text);
	}
	const clean = row(habit, new Map());
	assert.ok(clean.text.includes('🔥 2 days'), clean.text);
	const withinTarget = row({ ...habit, target: 1 }, new Map([[selectedDay, 1]]));
	assert.ok(withinTarget.text.includes('🔥 2 days'), withinTarget.text);
	const build = row({ ...habit, goal: 'build', target: 1 }, new Map([['2026-09-17', 1]]));
	assert.ok(build.text.includes('🔥 1 day'), build.text);
	console.log('Habit row passed: failed break days show slips; clean, at-target and build days retain streaks.');
} finally {
	await server.close();
}
