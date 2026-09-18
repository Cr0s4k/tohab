<script lang="ts">
	import { untrack } from 'svelte';
	import type { HabitView } from '$lib/db/schemas';
	import { setLog } from '$lib/habits';
	import { humanDateTime, humanDay } from '$lib/dates';
	import { habitStartDate, isActiveOn, isPausedOn, type LogMap } from '$lib/streaks';
	import Sheet from './Sheet.svelte';

	let { habit, day, value, lastActionAt, logs = new Map(), onClose }: { habit: HabitView; day: string; value: number; lastActionAt?: number; logs?: LogMap; onClose: () => void } = $props();
	let draft = $state(untrack(() => value));
	let saving = $state(false);
	let error = $state('');
	let active = $derived(isActiveOn(habit, day, logs));
	let paused = $derived(isPausedOn(habit, day));
	let valid = $derived(active && Number.isInteger(draft) && draft >= 0 && draft <= 10000);

	async function save() {
		if (!valid || saving) return;
		saving = true;
		error = '';
		try {
			await setLog(habit, day, draft);
			onClose();
		} catch (caught) {
			error = caught instanceof Error && caught.message ? caught.message : 'Could not save this entry. Please try again.';
		} finally { saving = false; }
	}
</script>

<Sheet open title={habit.name} confirmLabel="Cancel" onClose={() => { if (!saving) onClose(); }}>
	<form onsubmit={(event) => { event.preventDefault(); save(); }} class="space-y-4">
		<p class="text-sm font-semibold">{humanDay(day)}</p>
		{#if lastActionAt}
			<p class="dim text-xs">Last action <time datetime={new Date(lastActionAt).toISOString()}>{humanDateTime(lastActionAt)}</time></p>
		{/if}
		{#if !active}
			{#if paused}
				<p class="dim text-sm">This habit is paused through {humanDay(habit.pauseUntil!)}. Resume it to log this day.</p>
			{:else}
				<p class="dim text-sm">This habit starts on {humanDay(habitStartDate(habit, logs))}. Edit the start date to backfill this day.</p>
			{/if}
		{:else if habit.kind === 'binary'}
			<label class="flex min-h-11 items-center gap-3 text-sm">
				<input type="checkbox" checked={draft >= habit.target} onchange={(event) => (draft = event.currentTarget.checked ? habit.target : 0)} />
				Completed this day
			</label>
		{:else}
			<label class="block space-y-2 text-sm">
				<span>Amount{habit.unit ? ` (${habit.unit})` : ''}</span>
				<input type="number" min="0" max="10000" step="1" required bind:value={draft} class="sunken min-h-12 w-full rounded-xl px-3 text-lg tabular-nums" />
			</label>
			<p class="dim text-xs">Total for this day. Enter 0 to clear the entry{habit.goal === 'break' ? ' and record no occurrences' : ''}.</p>
		{/if}
		{#if error}<p role="alert" class="danger text-sm">{error}</p>{/if}
		<button type="submit" disabled={!valid || saving} class="tap accent-bg min-h-11 w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-30">{saving ? 'Saving…' : 'Save entry'}</button>
	</form>
</Sheet>
