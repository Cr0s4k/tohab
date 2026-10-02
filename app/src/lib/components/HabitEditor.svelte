<script lang="ts">
	import type { Habit, HabitRules, HabitView } from '#lib/db/schemas.js';
	import {
		createHabit,
		deleteHabit,
		HABIT_COLORS,
		HABIT_EMOJI,
		habitStartDate,
		updateHabit,
		type HabitInput
	} from '#lib/habits.js';
	import { humanDay, startOfWeekKey, today } from '#lib/dates.js';
	import { habitForEdit, habitRules, ruleChangeDate, rulesEqual } from '#lib/habitHistory.js';
	import type { LogMap } from '#lib/streaks.js';
	import { settings } from '#lib/settings.svelte.js';
	import { haptic, hapticTap } from '#lib/haptics.js';
	import { reportActionError } from '#lib/actionError.svelte.js';
	import Sheet from './Sheet.svelte';
	import HabitIdentityControls from './habit/HabitIdentityControls.svelte';
	import HabitScheduleControls from './habit/HabitScheduleControls.svelte';
	import HabitTrackingControls from './habit/HabitTrackingControls.svelte';

	let {
		open = false,
		habit = null,
		onClose,
		onDeleted,
		nextColor = 0,
		logs = new Map()
	}: {
		open?: boolean;
		habit?: HabitView | null;
		onClose: () => void;
		onDeleted?: () => void;
		nextColor?: number;
		logs?: LogMap;
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
			timesPerWeek: 3,
			startDate: today()
		};
	}

	let draft = $state<HabitInput>(blank());
	let loadedKey = $state('');
	let loadedDraft = $state<HabitInput | null>(null);
	let saving = $state(false);
	let error = $state('');
	let confirmingDelete = $state(false);
	let deleting = $state(false);

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

	let dirty = $derived.by(() => (
		loadedDraft !== null && JSON.stringify($state.snapshot(draft)) !== JSON.stringify(loadedDraft)
	));

	$effect(() => {
		if (!open) { loadedKey = ''; loadedDraft = null; error = ''; confirmingDelete = false; deleting = false; return; }
		const nextKey = habit
			? `${habit.id}:${habit.revisions?.map((revision) => `${revision.id}:${revision.updatedAt}`).join(',') ?? ''}`
			: 'new';
		if (habit && nextKey !== loadedKey && (!loadedKey || !dirty)) {
			loadedKey = nextKey;
			const editable = habitForEdit(habit);
			draft = {
				name: habit.name,
				emoji: habit.emoji,
				color: habit.color,
				goal: editable.goal ?? 'build',
				kind: editable.kind,
				target: editable.target,
				unit: editable.unit,
				scheduleKind: editable.scheduleKind,
				weekdays: [...editable.weekdays],
				timesPerWeek: editable.timesPerWeek,
				startDate: habitStartDate(habit, logs)
			};
			if (habit.pauseUntil) {
				draft.pauseFrom = habit.pauseFrom;
				draft.pauseUntil = habit.pauseUntil;
			}
			loadedDraft = { ...draft, weekdays: [...draft.weekdays] };
		} else if (!habit && loadedKey !== 'new') {
			loadedKey = 'new';
			draft = blank();
			loadedDraft = { ...draft, weekdays: [...draft.weekdays] };
		}
	});

	let nextRules = $derived<HabitRules>({
		goal: draft.goal,
		kind: draft.kind,
		target: draft.target,
		unit: draft.unit,
		scheduleKind: draft.scheduleKind,
		weekdays: draft.weekdays,
		timesPerWeek: draft.timesPerWeek
	});
	let plannedRules = $derived(habit ? habitRules(habitForEdit(habit)) : null);
	let rulesChanged = $derived(Boolean(plannedRules && !rulesEqual(plannedRules, nextRules)));
	let effectiveDate = $derived(
		habit && rulesChanged
			? ruleChangeDate({ ...habit, startDate: draft.startDate }, nextRules, settings.startOfWeek)
			: ''
	);
	let partialWeeklyStart = $derived(
		Boolean(
			draft.startDate &&
			draft.scheduleKind === 'weekly' &&
			startOfWeekKey(draft.startDate, settings.startOfWeek) !== draft.startDate
		)
	);

	let valid = $derived(
		draft.name.trim().length > 0 &&
			Boolean(draft.startDate) &&
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

	function setPauseUntil(value: string) {
		draft.pauseUntil = value || undefined;
		draft.pauseFrom = value ? (draft.pauseFrom || today()) : undefined;
	}

	function clearPause() {
		draft.pauseFrom = undefined;
		draft.pauseUntil = undefined;
	}

	async function confirmDelete() {
		if (!habit || deleting) return;
		deleting = true;
		try {
			haptic('warn');
			await deleteHabit(habit.id);
			(onDeleted ?? onClose)();
		} catch (caught) {
			reportActionError(caught, () => confirmDelete());
		} finally {
			deleting = false;
		}
	}

	async function toggleArchive() {
		if (!habit) return;
		try {
			await updateHabit(habit.id, { archived: !habit.archived });
			onClose();
		} catch (caught) {
			reportActionError(caught, () => toggleArchive());
		}
	}

	async function save() {
		if (!valid || saving) return;
		saving = true;
		error = '';
		try {
			haptic('success');
			// $state proxies cannot be structured-cloned into IndexedDB, so unwrap before writing.
			const input = $state.snapshot(draft);
			if (habit) await updateHabit(habit.id, input, { weekStartsOn: settings.startOfWeek });
			else await createHabit(input);
			loadedKey = '';
			onClose();
		} catch (caught) {
			error = caught instanceof Error && caught.message ? caught.message : 'Could not save your habit. Please try again.';
		}
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
				<label class="block space-y-1 text-sm font-medium">
					<span>Start date</span>
					<input
						type="date"
						aria-label="Start date"
						required
						bind:value={draft.startDate}
						class="sunken min-h-11 w-full rounded-xl px-3 py-2.5 text-copy outline-none"
					/>
				</label>
				<p class="dim text-xs">
					{#if draft.startDate && draft.startDate > today()}
						Starts {humanDay(draft.startDate)}. It will appear in Progress until then.
					{:else if draft.startDate && draft.startDate < today()}
						Starts {humanDay(draft.startDate)}. Backdate to include earlier days.
					{:else}
						Starts today.
					{/if}
				</p>
			</div>
			{#if habit}
				<div class="sunken space-y-2 rounded-2xl p-3">
					<div>
						<p class="text-sm font-medium">Take a pause</p>
						<p class="dim mt-1 text-xs">Paused days won’t count against your streak. Your entries stay safe.</p>
					</div>
					<div class="flex items-center gap-2">
						<input
							type="date"
							aria-label="Pause tracking through"
							min={today()}
							value={draft.pauseUntil ?? ''}
							oninput={(event) => setPauseUntil(event.currentTarget.value)}
							class="sunken min-h-11 min-w-0 flex-1 rounded-xl px-3 py-2.5 text-copy outline-none"
						/>
						{#if draft.pauseUntil}
							<button type="button" class="tap dim min-h-11 shrink-0 px-2 text-xs font-medium" onclick={clearPause}>Resume now</button>
						{/if}
					</div>
				</div>
			{/if}
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
			{#if habit && rulesChanged}
				<p class="dim text-xs" aria-live="polite">
					Tracking changes take effect {humanDay(effectiveDate)}.
				</p>
			{/if}
			{#if partialWeeklyStart}
				<p class="dim text-xs">The first partial week shows progress; scoring starts with the next full week.</p>
			{/if}
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
					{#if confirmingDelete}
						<div class="sunken flex-1 rounded-2xl p-3" role="alert">
							<p class="danger text-xs font-medium">Delete “{habit.name}” and its journal entries?</p>
							<div class="mt-2 flex gap-2">
								<button type="button" class="tap danger-bg flex-1 rounded-xl px-3 py-2 text-xs font-semibold text-white disabled:opacity-40" disabled={deleting} onclick={() => void confirmDelete()}>{deleting ? 'Deleting…' : 'Delete permanently'}</button>
								<button type="button" class="tap sunken rounded-xl px-3 py-2 text-xs font-medium" disabled={deleting} onclick={() => (confirmingDelete = false)}>Cancel</button>
							</div>
						</div>
					{:else}
						<button
							type="button"
							use:hapticTap
							onclick={() => (confirmingDelete = true)}
							class="tap sunken danger rounded-2xl px-5 py-3 text-sm font-semibold"
						>
							Delete
						</button>
					{/if}
				{/if}
			</div>

			{#if habit}
				<button
					type="button"
					onclick={() => void toggleArchive()}
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
