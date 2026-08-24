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
		if (!open) return;
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
		if (!valid) return;
		haptic('success');
		// $state proxies cannot be structured-cloned into IndexedDB, so unwrap before writing.
		const input = $state.snapshot(draft);
		if (habit) await updateHabit(habit.id, input);
		else await createHabit(input);
		loadedId = '';
		onClose();
	}
</script>

<Sheet
	{open}
	title={habit ? 'Edit habit' : 'New habit'}
	confirmLabel="Cancel"
	showHeader={false}
	onClose={onClose}
>
	{#snippet children()}
		<div class="flex flex-col gap-4">
			<HabitIdentityControls
				goal={draft.goal}
				bind:name={draft.name}
				bind:emoji={draft.emoji}
				bind:color={draft.color}
				onGoal={chooseGoal}
			/>
			<HabitTrackingControls
				goal={draft.goal}
				bind:kind={draft.kind}
				bind:target={draft.target}
				bind:unit={draft.unit}
			/>
			{#if draft.goal === 'build'}
				<HabitScheduleControls
					bind:scheduleKind={draft.scheduleKind}
					weekdays={draft.weekdays}
					bind:timesPerWeek={draft.timesPerWeek}
					onToggleWeekday={toggleWeekday}
				/>
			{/if}

			<div class="flex gap-2 pt-1">
				<button
					type="button"
					use:hapticTap
					disabled={!valid}
					onclick={save}
					class="tap accent-bg flex-1 rounded-2xl py-3 text-sm font-semibold disabled:opacity-30"
				>
					{habit ? 'Save' : 'Create habit'}
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
		</div>
	{/snippet}
</Sheet>
