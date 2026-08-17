<script lang="ts">
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
	import HabitRow from '$lib/components/HabitRow.svelte';
	import HabitEditor from '$lib/components/HabitEditor.svelte';
	import SyncBadge from '$lib/components/SyncBadge.svelte';
	import ProgressRing from '$lib/components/ProgressRing.svelte';
	import { flip } from 'svelte/animate';
	import { collapse, flipCfg } from '$lib/motion';

	let offset = $state(0);
	let creating = $state(false);

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

<header class="hairline raised z-20 shrink-0 border-b pt-safe">
	<div class="flex items-center justify-between px-4 pt-2 pb-2">
		<h1 class="text-2xl font-bold tracking-tight">Habits</h1>
		<div class="flex items-center gap-2">
			<SyncBadge />
			<button
				type="button"
				aria-label="New habit"
				onclick={() => (creating = true)}
				class="tap accent-bg grid size-8 place-items-center rounded-full"
			>
				<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
					<path d="M12 5v14M5 12h14" />
				</svg>
			</button>
		</div>
	</div>

	<div class="flex items-center justify-between px-4 pb-3">
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

<main class="flex-1">
	{#if !habits.value.length}
		<div class="px-8 py-14 text-center">
			<p class="dim text-sm">No habits yet.</p>
			<button
				type="button"
				onclick={() => (creating = true)}
				class="tap accent-bg mt-4 rounded-2xl px-5 py-2.5 text-sm font-semibold"
			>
				Create your first habit
			</button>
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
				class="sunken dim px-4 py-1.5 text-[0.7rem] font-semibold tracking-wide uppercase"
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

<HabitEditor open={creating} nextColor={habits.value.length} onClose={() => (creating = false)} />
