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
	import { WEEKDAY_LABELS, WEEKDAY_NAMES } from '$lib/dates';
	import { haptic, hapticTap } from '$lib/haptics';
	import Sheet from './Sheet.svelte';

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
			<div>
				<p class="dim mb-1.5 text-[0.7rem] font-semibold tracking-wide uppercase">
					I want to track
				</p>
				<div class="flex gap-1.5">
					<button
						type="button"
						use:hapticTap
						onclick={() => chooseGoal('build')}
						class="tap flex-1 rounded-xl py-2.5 text-[0.8rem] font-medium"
						class:accent-bg={draft.goal === 'build'}
						class:sunken={draft.goal !== 'build'}
					>
						Build a good habit
					</button>
					<button
						type="button"
						use:hapticTap
						onclick={() => chooseGoal('break')}
						class="tap flex-1 rounded-xl py-2.5 text-[0.8rem] font-medium"
						class:accent-bg={draft.goal === 'break'}
						class:sunken={draft.goal !== 'break'}
					>
						Break a bad habit
					</button>
				</div>
			</div>

			<div class="flex gap-2">
				<span
					class="grid size-12 shrink-0 place-items-center rounded-2xl text-2xl"
					style="background: color-mix(in oklch, {draft.color} 20%, transparent)"
				>
					{draft.emoji}
				</span>
				<div class="min-w-0 flex-1">
					{#if draft.goal === 'break'}
						<p class="dim mb-1.5 text-[0.7rem] font-semibold tracking-wide uppercase">
							Goal
						</p>
					{/if}
					<input
						bind:value={draft.name}
						placeholder={draft.goal === 'break' ? 'e.g. Stop smoking' : 'Habit name'}
						class="sunken w-full rounded-2xl px-4 text-[0.95rem] outline-none placeholder:opacity-50"
					/>
				</div>
			</div>

			<div class="flex flex-wrap gap-1.5">
				{#each HABIT_EMOJI as e (e)}
					<button
						type="button"
						onclick={() => (draft.emoji = e)}
						class="tap sunken grid size-9 place-items-center rounded-xl text-lg"
						class:ring-2={draft.emoji === e}
						style="--tw-ring-color: var(--accent)"
					>
						{e}
					</button>
				{/each}
			</div>

			<div class="flex gap-2">
				{#each HABIT_COLORS as c (c)}
					<button
						type="button"
						aria-label="Colour"
						onclick={() => (draft.color = c)}
						class="tap size-8 flex-1 rounded-xl"
						class:ring-2={draft.color === c}
						style="background: {c}; --tw-ring-color: var(--text); --tw-ring-offset-width: 2px"
					></button>
				{/each}
			</div>

			{#if draft.goal === 'break'}
				<div>
					<label class="block">
						<span class="dim mb-1.5 block text-[0.7rem] font-semibold tracking-wide uppercase">
							No more than
						</span>
						<div class="flex items-center gap-2">
							<input
								type="number"
								min="0"
								max="10000"
								bind:value={draft.target}
								class="sunken w-full rounded-xl px-3 py-2.5 text-sm outline-none"
							/>
							<span class="dim shrink-0 text-sm">per day</span>
						</div>
					</label>
					<p class="dim mt-2 text-[0.7rem]">
						Each tap records one slip. Staying at or under this limit counts as a win.
					</p>
				</div>
			{:else}
				<div>
					<p class="dim mb-1.5 text-[0.7rem] font-semibold tracking-wide uppercase">Type</p>
					<div class="flex gap-1.5">
						<button
							type="button"
							onclick={() => {
								draft.kind = 'binary';
								draft.target = 1;
							}}
							class="tap flex-1 rounded-xl py-2.5 text-[0.8rem] font-medium"
							class:accent-bg={draft.kind === 'binary'}
							class:sunken={draft.kind !== 'binary'}
						>
							Done / not done
						</button>
						<button
							type="button"
							onclick={() => {
								draft.kind = 'quantity';
								if (draft.target < 2) draft.target = 8;
							}}
							class="tap flex-1 rounded-xl py-2.5 text-[0.8rem] font-medium"
							class:accent-bg={draft.kind === 'quantity'}
							class:sunken={draft.kind !== 'quantity'}
						>
							Count a quantity
						</button>
					</div>
				</div>

				{#if draft.kind === 'quantity'}
					<div class="flex gap-2">
						<label class="flex-1">
							<span class="dim mb-1.5 block text-[0.7rem] font-semibold tracking-wide uppercase">
								Daily goal
							</span>
							<input
								type="number"
								min="1"
								max="10000"
								bind:value={draft.target}
								class="sunken w-full rounded-xl px-3 py-2.5 text-sm outline-none"
							/>
						</label>
						<label class="flex-1">
							<span class="dim mb-1.5 block text-[0.7rem] font-semibold tracking-wide uppercase">
								Unit
							</span>
							<input
								bind:value={draft.unit}
								placeholder="glasses"
								class="sunken w-full rounded-xl px-3 py-2.5 text-sm outline-none placeholder:opacity-50"
							/>
						</label>
					</div>
				{/if}

				<div>
					<p class="dim mb-1.5 text-[0.7rem] font-semibold tracking-wide uppercase">Schedule</p>
					<div class="flex gap-1.5">
						{#each [{ id: 'daily', label: 'Every day' }, { id: 'weekdays', label: 'Certain days' }, { id: 'weekly', label: 'X per week' }] as opt (opt.id)}
							<button
								type="button"
								onclick={() => (draft.scheduleKind = opt.id as typeof draft.scheduleKind)}
								class="tap flex-1 rounded-xl py-2.5 text-[0.75rem] font-medium"
								class:accent-bg={draft.scheduleKind === opt.id}
								class:sunken={draft.scheduleKind !== opt.id}
							>
								{opt.label}
							</button>
						{/each}
					</div>
				</div>

				{#if draft.scheduleKind === 'weekdays'}
					<div class="flex gap-1.5">
						{#each [1, 2, 3, 4, 5, 6, 0] as d (d)}
							<button
								type="button"
								use:hapticTap
								aria-label={WEEKDAY_NAMES[d]}
								onclick={() => toggleWeekday(d)}
								class="tap flex-1 rounded-xl py-2.5 text-[0.8rem] font-semibold"
								class:accent-bg={draft.weekdays.includes(d)}
								class:sunken={!draft.weekdays.includes(d)}
							>
								{WEEKDAY_LABELS[d]}
							</button>
						{/each}
					</div>
				{/if}

				{#if draft.scheduleKind === 'weekly'}
					<div>
						<div class="flex gap-1.5">
							{#each [1, 2, 3, 4, 5, 6, 7] as n (n)}
								<button
									type="button"
									onclick={() => (draft.timesPerWeek = n)}
									class="tap flex-1 rounded-xl py-2.5 text-[0.8rem] font-semibold"
									class:accent-bg={draft.timesPerWeek === n}
									class:sunken={draft.timesPerWeek !== n}
								>
									{n}
								</button>
							{/each}
						</div>
						<p class="dim mt-1.5 text-[0.7rem]">
							Any {draft.timesPerWeek} {draft.timesPerWeek === 1 ? 'day' : 'days'} a week. Streaks count
							weeks, not days.
						</p>
					</div>
				{/if}
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
