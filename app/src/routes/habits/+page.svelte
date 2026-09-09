<script lang="ts">
	import { goto } from '$app/navigation';
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import type { Habit, HabitLog, HabitRevision, HabitView } from '$lib/db/schemas';
	import {
		currentStreak,
		groupLogs,
		habitsQuery,
		isActiveOn,
		isDue,
		isComplete,
		logsQuery,
		tapLog,
		periodValue,
		revisionsQuery,
		updateHabit,
		valueOn
	} from '$lib/habits';
	import { humanDay, shiftKey, today } from '$lib/dates';
	import { habitOn, withHabitHistory } from '$lib/habitHistory';
	import type { LogMap } from '$lib/streaks';
	import { settings } from '$lib/settings.svelte';
	import { habitCompose } from '$lib/compose.svelte';
	import HabitRow from '$lib/components/HabitRow.svelte';
	import HabitLogEditor from '$lib/components/HabitLogEditor.svelte';
	import HabitEditor from '$lib/components/HabitEditor.svelte';
	import Fab from '$lib/components/Fab.svelte';
	import ProgressRing from '$lib/components/ProgressRing.svelte';
	import SettingsButton from '$lib/components/SettingsButton.svelte';
	import { haptic, hapticTap } from '$lib/haptics';
	import { flip } from 'svelte/animate';
	import { collapse, flipCfg } from '$lib/motion';
	import { shouldAnimateList } from '$lib/pwa';

	function plainDoc<T>(doc: T): T {
		const candidate = doc as T & { toMutableJSON?: () => T };
		return typeof candidate.toMutableJSON === 'function' ? candidate.toMutableJSON() : doc;
	}

	let offset = $state(0);
	let showArchived = $state(false);
	let restoring = $state('');
	let archiveError = $state('');
	let logEntry = $state<{ habit: HabitView; day: string; value: number; logs: LogMap } | null>(null);

	async function restore(habit: Habit) {
		if (restoring) return;
		restoring = habit.id;
		archiveError = '';
		try { await updateHabit(habit.id, { archived: false }); }
		catch { archiveError = 'Could not restore this habit. Please try again.'; }
		finally { restoring = ''; }
	}

	function logHabit(habit: Habit, value: number) {
		if (habit.kind === 'quantity') logEntry = { habit, day, value, logs: byHabit.get(habit.id) ?? new Map() };
		else void tapLog(habit, day, value);
	}

	let day = $derived(shiftKey(today(), offset));

	let habitDocs = rx<Habit[]>(() => (live.db ? habitsQuery(live.db, true).$ : null), []);
	let revisionDocs = rx<HabitRevision[]>(() => (live.db ? revisionsQuery(live.db).$ : null), []);
	let logs = rx<HabitLog[]>(() => (live.db ? logsQuery(live.db).$ : null), []);

	let habits = $derived(
		habitDocs.value.map((habit) =>
			withHabitHistory(plainDoc(habit), revisionDocs.value.map((revision) => plainDoc(revision)))
		)
	);
	let byHabit = $derived(groupLogs(logs.value));

	let active = $derived(habits.filter((h) => !h.archived));
	let available = $derived(active.map((h) => habitOn(h, day)).filter((h) => isActiveOn(h, day, byHabit.get(h.id))));
	let archived = $derived(habits.filter((h) => h.archived));
	let due = $derived(available.filter((h) => isDue(h, day, byHabit.get(h.id))));
	let rest = $derived(available.filter((h) => !isDue(h, day, byHabit.get(h.id))));
	let buildDue = $derived(due.filter((h) => h.goal !== 'break'));
	let buildRest = $derived(rest.filter((h) => h.goal !== 'break'));
	let breakDue = $derived(due.filter((h) => h.goal === 'break'));
	let breakRest = $derived(rest.filter((h) => h.goal === 'break'));
	let listFlipCfg = $derived(shouldAnimateList(habits.length) ? flipCfg : { duration: 0 });

	let doneCount = $derived(
		due.filter((h) => isComplete(h, byHabit.get(h.id) ?? new Map(), day, settings.startOfWeek)).length
	);
	let buildDoneCount = $derived(
		buildDue.filter((h) => isComplete(h, byHabit.get(h.id) ?? new Map(), day, settings.startOfWeek)).length
	);
	let breakDoneCount = $derived(
		breakDue.filter((h) => isComplete(h, byHabit.get(h.id) ?? new Map(), day, settings.startOfWeek)).length
	);
	let sections = $derived(
		[
			{ key: 'build', label: 'Build habits', due: buildDue, rest: buildRest, done: buildDoneCount },
			{ key: 'break', label: 'Break habits', due: breakDue, rest: breakRest, done: breakDoneCount }
		].filter((section) => section.due.length || section.rest.length)
	);
</script>

<header class="z-20 shrink-0 border-b pt-safe" style:border-color="var(--product-library-divider-secondary)">
	<div class="measure flex items-center justify-between px-4 pt-2 pb-2">
		<div class="flex min-w-0 items-center gap-2">
			<h1 class="truncate text-header md:text-header-large font-bold tracking-tight">Journal</h1>
		</div>
		<div class="flex items-center gap-2">
			<button
				type="button"
				use:hapticTap
				aria-label="Archived habits"
				aria-pressed={showArchived}
				title={showArchived ? 'Return to journal' : 'Show archived habits'}
				onclick={() => (showArchived = !showArchived)}
				class="tap hairline grid size-9 shrink-0 place-items-center rounded-full border {showArchived ? 'accent-bg' : 'sunken'}"
			>
				<svg aria-hidden="true" viewBox="0 0 24 24" class="size-[1.05rem]" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="3" width="18" height="4" rx="1" />
					<path d="M5 7v13h14V7M10 11h4" />
				</svg>
			</button>
			<button
				type="button"
				use:hapticTap
				onclick={() => {
					haptic('tap');
					goto('/tasks?view=today');
				}}
				aria-label="Switch to Tasks"
				class="tap sunken hairline grid size-9 shrink-0 place-items-center rounded-full border md:hidden"
			>
				<svg
					viewBox="0 0 24 24"
					class="size-[1.05rem]"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4-4m-4 4l4 4" />
				</svg>
			</button>
			<SettingsButton />
		</div>
	</div>

	<div class="measure flex items-center justify-between px-4 pb-3 md:justify-center md:gap-12">
		<button
			type="button"
			use:hapticTap
			aria-label="Previous day"
			onclick={() => {
				haptic('tap');
				offset -= 1;
			}}
			class="tap dim p-1"
		>
			<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M15 19l-7-7 7-7" />
			</svg>
		</button>

		<div class="flex items-center gap-3">
			<ProgressRing
				value={doneCount}
				target={Math.max(1, due.length)}
				size={34}
				color="var(--accent)"
				label={String(doneCount)}
			/>
			<div class="text-center">
				<p class="text-sm font-semibold">{humanDay(day)}</p>
				<p class="dim text-caption">{doneCount} of {due.length} done</p>
			</div>
		</div>

		<button
			type="button"
			use:hapticTap
			aria-label="Next day"
			disabled={offset >= 0}
			onclick={() => {
				haptic('tap');
				offset += 1;
			}}
			class="tap dim p-1 disabled:opacity-25"
		>
			<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M9 5l7 7-7 7" />
			</svg>
		</button>
	</div>
</header>

<main class="flex-1 pb-20">
	{#if showArchived}
		<div class="measure px-4 py-4">
			<h2 class="mb-3 text-sm font-semibold">Archived habits</h2>
			{#if archiveError}<p role="alert" class="danger mb-3 text-sm">{archiveError}</p>{/if}
			{#each archived as habit (habit.id)}
				<div class="hairline flex items-center gap-3 border-b py-3">
					<a href="/habits/{habit.id}" class="min-w-0 flex-1 text-sm">{habit.emoji} {habit.name}</a>
					<button type="button" disabled={!!restoring} onclick={() => restore(habit)} class="tap accent-fg min-h-11 px-3 text-sm disabled:opacity-30">{restoring === habit.id ? 'Restoring…' : 'Restore'}</button>
				</div>
			{:else}<p class="dim py-8 text-center text-sm">No archived habits.</p>{/each}
		</div>
	{:else if !active.length}
		<div class="measure px-8 py-14 text-center">
			<p class="dim text-sm">No habits yet.</p>
		</div>
	{:else if !sections.length}
		<div class="measure px-8 py-14 text-center">
			<p class="dim text-sm">No habits scheduled for {humanDay(day)}.</p>
			<p class="dim mt-2 text-xs">Future habits appear here when they start.</p>
		</div>
	{:else}
		{#each sections as section}
			<section
				aria-labelledby="{section.key}-habits-heading"
				class:mt-4={section.key === 'break' && sections.length > 1}
			>
				<div class="surface sticky top-0 z-10 px-4 pt-1.5 pb-0 text-copy font-semibold tracking-wide">
					<div class="hairline measure flex items-baseline justify-between border-b pb-1.5">
						<h2 id="{section.key}-habits-heading" class="text-copy font-semibold tracking-wide">{section.label}</h2>
						{#if section.due.length}<span class="dim text-caption">{section.done} of {section.due.length} done</span>{/if}
					</div>
				</div>

				{#each section.due as habit (habit.id)}
					{@const habitLogs = byHabit.get(habit.id) ?? new Map()}
					<div data-list-item transition:collapse={{ duration: shouldAnimateList(habits.length) ? 240 : 0 }} animate:flip={listFlipCfg}>
						<HabitRow
							{habit}
							value={periodValue(habit, habitLogs, day, settings.startOfWeek)}
							streak={currentStreak(habit, habitLogs, settings.startOfWeek, day)}
							dayValue={valueOn(habitLogs, day)}
							onTap={() => logHabit(habit, valueOn(habitLogs, day))}
						/>
					</div>
				{/each}

				{#if section.rest.length}
					<h3
						transition:collapse
						class="surface sticky top-0 z-10 px-4 pt-1.5 pb-0 text-copy font-semibold tracking-wide"
					>
						<span class="hairline measure block border-b pb-1.5">Not scheduled today</span>
					</h3>
					{#each section.rest as habit (habit.id)}
						{@const habitLogs = byHabit.get(habit.id) ?? new Map()}
						<div data-list-item transition:collapse={{ duration: shouldAnimateList(habits.length) ? 240 : 0 }} animate:flip={listFlipCfg}>
							<HabitRow
								{habit}
								value={periodValue(habit, habitLogs, day, settings.startOfWeek)}
								streak={currentStreak(habit, habitLogs, settings.startOfWeek, day)}
								due={false}
								dayValue={valueOn(habitLogs, day)}
								onTap={() => logHabit(habit, valueOn(habitLogs, day))}
							/>
						</div>
					{/each}
				{/if}
			</section>
		{/each}
	{/if}
</main>

<Fab label="New habit" mobileOnly onPress={() => (habitCompose.open = true)} />

<HabitEditor
	open={habitCompose.open}
	nextColor={habits.length}
	onClose={() => (habitCompose.open = false)}
/>

{#if logEntry}
	<HabitLogEditor {...logEntry} onClose={() => (logEntry = null)} />
{/if}
