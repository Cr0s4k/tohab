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
		periodValue,
		valueOn
	} from '$lib/habits';
	import { humanDay, shiftKey, today } from '$lib/dates';
	import { settings } from '$lib/settings.svelte';
	import { habitCompose } from '$lib/compose.svelte';
	import HabitRow from '$lib/components/HabitRow.svelte';
	import HabitEditor from '$lib/components/HabitEditor.svelte';
	import Fab from '$lib/components/Fab.svelte';
	import ProgressRing from '$lib/components/ProgressRing.svelte';
	import SettingsButton from '$lib/components/SettingsButton.svelte';
	import { haptic, hapticTap } from '$lib/haptics';
	import { flip } from 'svelte/animate';
	import { collapse, flipCfg } from '$lib/motion';
	import { shouldAnimateList } from '$lib/pwa';

	let offset = $state(0);

	let day = $derived(shiftKey(today(), offset));

	let habits = rx<Habit[]>(() => (live.db ? habitsQuery(live.db).$ : null), []);
	let logs = rx<HabitLog[]>(() => (live.db ? logsQuery(live.db).$ : null), []);

	let byHabit = $derived(groupLogs(logs.value));

	let due = $derived(habits.value.filter((h) => isDue(h, day)));
	let rest = $derived(habits.value.filter((h) => !isDue(h, day)));
	let listFlipCfg = $derived(shouldAnimateList(habits.value.length) ? flipCfg : { duration: 0 });

	let doneCount = $derived(
		due.filter((h) => isComplete(h, byHabit.get(h.id) ?? new Map(), day, settings.startOfWeek)).length
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
				<p class="dim text-[0.7rem]">{doneCount} of {due.length} done</p>
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
	{#if !habits.value.length}
		<div class="measure px-8 py-14 text-center">
			<p class="dim text-sm">No habits yet.</p>
		</div>
	{:else}
		{#each due as habit (habit.id)}
			{@const habitLogs = byHabit.get(habit.id) ?? new Map()}
			<div data-list-item transition:collapse={{ duration: shouldAnimateList(habits.value.length) ? 240 : 0 }} animate:flip={listFlipCfg}>
				<HabitRow
					{habit}
					value={periodValue(habit, habitLogs, day, settings.startOfWeek)}
					streak={currentStreak(habit, habitLogs, settings.startOfWeek, day)}
					onTap={() => tapLog(habit, day, valueOn(habitLogs, day))}
				/>
			</div>
		{/each}

		{#if rest.length}
			<h2
				transition:collapse
				class="surface sticky top-0 z-10 px-4 pt-1.5 pb-0 text-copy font-semibold tracking-wide"
			>
				<span class="hairline measure block border-b pb-1.5">Not scheduled today</span>
			</h2>
			{#each rest as habit (habit.id)}
				{@const habitLogs = byHabit.get(habit.id) ?? new Map()}
				<div data-list-item transition:collapse={{ duration: shouldAnimateList(habits.value.length) ? 240 : 0 }} animate:flip={listFlipCfg}>
					<HabitRow
						{habit}
						value={periodValue(habit, habitLogs, day, settings.startOfWeek)}
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
