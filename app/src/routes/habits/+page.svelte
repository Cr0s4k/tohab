<script lang="ts">
	import { goto } from '$app/navigation';
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import type { Habit, HabitLog } from '$lib/db/schemas';
	import {
		currentStreak,
		groupLogs,
		habitsQuery,
		isDue,
		isComplete,
		logsQuery,
		tapLog,
		valueOn
	} from '$lib/habits';
	import { humanDay, shiftKey, today } from '$lib/dates';
	import { settings } from '$lib/settings.svelte';
	import { habitCompose } from '$lib/compose.svelte';
	import HabitRow from '$lib/components/HabitRow.svelte';
	import HabitEditor from '$lib/components/HabitEditor.svelte';
	import Fab from '$lib/components/Fab.svelte';
	import SyncBadge from '$lib/components/SyncBadge.svelte';
	import ProgressRing from '$lib/components/ProgressRing.svelte';
	import SettingsButton from '$lib/components/SettingsButton.svelte';
	import { flip } from 'svelte/animate';
	import { collapse, flipCfg } from '$lib/motion';

	let offset = $state(0);

	let day = $derived(shiftKey(today(), offset));

	let habits = rx<Habit[]>(() => (live.db ? habitsQuery(live.db).$ : null), []);
	let logs = rx<HabitLog[]>(() => (live.db ? logsQuery(live.db).$ : null), []);

	let byHabit = $derived(groupLogs(logs.value));

	let due = $derived(habits.value.filter((h) => isDue(h, day)));
	let rest = $derived(habits.value.filter((h) => !isDue(h, day)));

	let doneCount = $derived(
		due.filter((h) => isComplete(h, byHabit.get(h.id) ?? new Map(), day)).length
	);
</script>

<header class="hairline z-20 shrink-0 border-b pt-safe">
	<div class="measure flex items-center justify-between px-4 pt-2 pb-2">
		<div class="flex min-w-0 items-center gap-2">
			<button
				type="button"
				onclick={() => goto('/tasks?view=today')}
				aria-label="Switch to Tasks"
				class="tap sunken hairline flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold md:hidden"
			>
				<svg
					viewBox="0 0 24 24"
					class="size-4"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4-4m-4 4l4 4" />
				</svg>
				Tasks
			</button>
			<h1 class="truncate text-2xl font-bold tracking-tight">Journal</h1>
		</div>
		<div class="flex items-center gap-2">
			<SettingsButton />
			<SyncBadge />
		</div>
	</div>

	<div class="measure flex items-center justify-between px-4 pb-3 md:justify-center md:gap-12">
		<button
			type="button"
			aria-label="Previous day"
			onclick={() => (offset -= 1)}
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
				<p class="dim text-[0.7rem]">{doneCount} of {due.length} done</p>
			</div>
		</div>

		<button
			type="button"
			aria-label="Next day"
			disabled={offset >= 0}
			onclick={() => (offset += 1)}
			class="tap dim p-1 disabled:opacity-25"
		>
			<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M9 5l7 7-7 7" />
			</svg>
		</button>
	</div>
</header>

<main class="flex-1 pb-20">
	{#if !habits.value.length}
		<div class="measure px-8 py-14 text-center">
			<p class="dim text-sm">No habits yet.</p>
		</div>
	{:else}
		{#each due as habit (habit.id)}
			{@const habitLogs = byHabit.get(habit.id) ?? new Map()}
			<div transition:collapse animate:flip={flipCfg}>
				<HabitRow
					{habit}
					value={valueOn(habitLogs, day)}
					streak={currentStreak(habit, habitLogs, settings.startOfWeek, day)}
					onTap={() => tapLog(habit, day, valueOn(habitLogs, day))}
				/>
			</div>
		{/each}

		{#if rest.length}
			<h2
				transition:collapse
				class="sunken dim sticky top-0 z-10 px-4 py-1.5 text-[0.7rem] font-semibold tracking-wide uppercase"
			>
				Not scheduled today
			</h2>
			{#each rest as habit (habit.id)}
				{@const habitLogs = byHabit.get(habit.id) ?? new Map()}
				<div transition:collapse animate:flip={flipCfg}>
					<HabitRow
						{habit}
						value={valueOn(habitLogs, day)}
						streak={currentStreak(habit, habitLogs, settings.startOfWeek, day)}
						due={false}
						onTap={() => tapLog(habit, day, valueOn(habitLogs, day))}
					/>
				</div>
			{/each}
		{/if}
	{/if}
</main>

<Fab label="New habit" mobileOnly onPress={() => (habitCompose.open = true)} />

<HabitEditor
	open={habitCompose.open}
	nextColor={habits.value.length}
	onClose={() => (habitCompose.open = false)}
/>
