<script lang="ts">
	import type { Habit } from '$lib/db/schemas';
	import {
		createHabit,
		deleteHabit,
		HABIT_COLORS,
		HABIT_EMOJI,
		updateHabit,
		type HabitInput
	} from '$lib/habits';
	import { haptic, hapticTap } from '$lib/haptics';
	import Sheet from './Sheet.svelte';
	import HabitIdentityControls from './habit/HabitIdentityControls.svelte';
	import HabitScheduleControls from './habit/HabitScheduleControls.svelte';
	import HabitTrackingControls from './habit/HabitTrackingControls.svelte';

	let {
		open = false,
		habit = null,
		onClose,
		onDeleted,
		nextColor = 0
	}: {
		open?: boolean;
		habit?: Habit | null;
		onClose: () => void;
		onDeleted?: () => void;
		nextColor?: number;
	} = $props();

	function blank(): HabitInput {
		return {
			name: '',
			emoji: HABIT_EMOJI[0],
			color: HABIT_COLORS[nextColor % HABIT_COLORS.length],
			goal: 'build',
			kind: 'binary',
			target: 1,
			unit: '',
			scheduleKind: 'daily',
			weekdays: [1, 2, 3, 4, 5],
			timesPerWeek: 3
		};
	}

	let draft = $state<HabitInput>(blank());
	let loadedId = $state('');
	let saving = $state(false);
	let error = $state('');

	function chooseGoal(goal: 'build' | 'break') {
		if (draft.goal === goal) return;
		haptic('tap');
		draft.goal = goal;
		if (goal === 'break') {
			draft.kind = 'quantity';
			draft.target = 0;
			draft.unit = '';
			draft.scheduleKind = 'daily';
		} else {
			draft.kind = 'binary';
			draft.target = 1;
			draft.unit = '';
			draft.scheduleKind = 'daily';
		}
	}

	$effect(() => {
		if (!open) { loadedId = ''; error = ''; return; }
		if (habit && habit.id !== loadedId) {
			loadedId = habit.id;
			draft = {
				name: habit.name,
				emoji: habit.emoji,
				color: habit.color,
				goal: habit.goal ?? 'build',
				kind: habit.kind,
				target: habit.target,
				unit: habit.unit,
				scheduleKind: habit.scheduleKind,
				weekdays: [...habit.weekdays],
				timesPerWeek: habit.timesPerWeek
			};
		} else if (!habit && loadedId !== 'new') {
			loadedId = 'new';
			draft = blank();
		}
	});

	let valid = $derived(
		draft.name.trim().length > 0 &&
			Number.isInteger(draft.target) && draft.target >= (draft.goal === 'break' ? 0 : 1) && draft.target <= 10000 &&
			(draft.goal === 'break' ||
				draft.scheduleKind !== 'weekdays' ||
				draft.weekdays.length > 0)
	);

	function toggleWeekday(d: number) {
		haptic('tap');
		draft.weekdays = draft.weekdays.includes(d)
			? draft.weekdays.filter((x) => x !== d)
			: [...draft.weekdays, d].sort();
	}

	async function save() {
		if (!valid || saving) return;
		saving = true;
		error = '';
		try {
			haptic('success');
			// $state proxies cannot be structured-cloned into IndexedDB, so unwrap before writing.
			const input = $state.snapshot(draft);
			if (habit) await updateHabit(habit.id, input);
			else await createHabit(input);
			loadedId = '';
			onClose();
		} catch { error = 'Could not save your habit. Please try again.'; }
		finally { saving = false; }
	}
</script>

<Sheet
	{open}
	title={habit ? 'Edit habit' : 'Add habit'}
	confirmLabel="Cancel"
	showHeader={true}
	onClose={onClose}
>
	{#snippet children()}
		<form onsubmit={(event) => { event.preventDefault(); save(); }} class="flex flex-col gap-5">
			<HabitIdentityControls bind:name={draft.name} bind:emoji={draft.emoji} bind:color={draft.color} />
			<div class="space-y-2">
				<p class="text-sm font-medium">What’s your goal?</p>
				<div class="sunken grid grid-cols-2 gap-1 rounded-xl p-1">
					{#each [{ id: 'build', label: 'Build a habit' }, { id: 'break', label: 'Break a habit' }] as option}
						<button type="button" onclick={() => chooseGoal(option.id as 'build' | 'break')} aria-pressed={draft.goal === option.id} class="tap min-h-11 rounded-lg text-sm" class:chosen={draft.goal === option.id}>{option.label}</button>
					{/each}
				</div>
			</div>
			<HabitTrackingControls goal={draft.goal} bind:kind={draft.kind} bind:target={draft.target} bind:unit={draft.unit} bind:scheduleKind={draft.scheduleKind} />
			{#if draft.goal === 'build' && (draft.kind === 'binary' || draft.scheduleKind !== 'weekly')}
				<HabitScheduleControls quantity={draft.kind === 'quantity'} bind:scheduleKind={draft.scheduleKind} weekdays={draft.weekdays} bind:timesPerWeek={draft.timesPerWeek} onToggleWeekday={toggleWeekday} />
			{/if}
			<p class="dim text-sm leading-relaxed" aria-live="polite">
				{#if draft.goal === 'break' || draft.kind === 'quantity'}
					{draft.goal === 'break' ? 'At most' : 'At least'} <strong class="font-semibold">{draft.target ?? '…'} {draft.unit.trim() || 'times'}</strong> {draft.scheduleKind === 'weekly' ? 'per week' : draft.scheduleKind === 'weekdays' ? 'on each selected day' : 'per day'}.
				{:else}
					Check in {draft.scheduleKind === 'weekly' ? `any ${draft.timesPerWeek} days a week` : draft.scheduleKind === 'weekdays' ? 'on your selected days' : 'every day'}.
				{/if}
			</p>
			{#if error}<p role="alert" class="danger text-sm">{error}</p>{/if}

			<div class="flex gap-2 pt-1">
				<button
					type="submit"
					use:hapticTap
					disabled={!valid || saving}
					class="tap accent-bg flex-1 rounded-2xl py-3 text-sm font-semibold disabled:opacity-30"
				>
					{saving ? 'Saving…' : habit ? 'Save changes' : 'Create habit'}
				</button>
				{#if habit}
					<button
						type="button"
						use:hapticTap
						onclick={() => {
							haptic('warn');
							deleteHabit(habit.id).then(() => (onDeleted ?? onClose)());
						}}
						class="tap sunken danger rounded-2xl px-5 py-3 text-sm font-semibold"
					>
						Delete
					</button>
				{/if}
			</div>

			{#if habit}
				<button
					type="button"
					onclick={() => updateHabit(habit.id, { archived: !habit.archived }).then(onClose)}
					class="tap dim text-center text-[0.75rem] font-medium"
				>
					{habit.archived ? 'Unarchive habit' : 'Archive habit (keeps history)'}
				</button>
			{/if}
		</form>
	{/snippet}
</Sheet>

<style>
	.chosen { background: var(--surface-raised); box-shadow: 0 1px 3px #0001; font-weight: 600; }
</style>
