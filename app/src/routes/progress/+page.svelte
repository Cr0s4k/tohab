<script lang="ts">
	import { goto } from '$app/navigation';
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import type { Habit, HabitLog } from '$lib/db/schemas';
	import {
		bestStreak,
		completionRate,
		currentStreak,
		groupLogs,
		habitsQuery,
		isComplete,
		isDue,
		logsQuery,
		valueOn,
		type LogMap
	} from '$lib/habits';
	import { shiftKey, today, type DayKey } from '$lib/dates';
	import { settings } from '$lib/settings.svelte';
	import { haptic, hapticTap } from '$lib/haptics';
	import ProgressRing from '$lib/components/ProgressRing.svelte';
	import SettingsButton from '$lib/components/SettingsButton.svelte';

	let todayKey = $derived(today());

	let habits = rx<Habit[]>(() => (live.db ? habitsQuery(live.db).$ : null), []);
	let logs = rx<HabitLog[]>(() => (live.db ? logsQuery(live.db).$ : null), []);

	let byHabit = $derived(groupLogs(logs.value));

	function percent(done: number, due: number): number {
		return due === 0 ? 0 : Math.round((done / due) * 100);
	}

	function windowStats(
		habits: Habit[],
		byHabit: Map<string, LogMap>,
		days: number,
		todayKey: DayKey
	) {
		let due = 0;
		let done = 0;
		for (const habit of habits) {
			const map = byHabit.get(habit.id) ?? new Map();
			for (let i = 0; i < days; i++) {
				const day = shiftKey(todayKey, -i);
				if (!isDue(habit, day)) continue;
				due++;
				if (isComplete(habit, map, day)) done++;
			}
		}
		return { due, done };
	}

	let overview = $derived.by(() => {
		const active = habits.value;
		const dueToday = active.filter((habit) => isDue(habit, todayKey));
		const doneToday = dueToday.filter((habit) =>
			isComplete(habit, byHabit.get(habit.id) ?? new Map(), todayKey)
		).length;
		const seven = windowStats(active, byHabit, 7, todayKey);
		const thirty = windowStats(active, byHabit, 30, todayKey);

		return {
			dueToday: dueToday.length,
			doneToday,
			seven,
			thirty
		};
	});

	let rows = $derived.by(() =>
		habits.value.map((habit) => {
			const map = byHabit.get(habit.id) ?? new Map();
			const value = valueOn(map, todayKey);
			return {
				habit,
				value,
				current: currentStreak(habit, map, settings.startOfWeek, todayKey),
				best: bestStreak(habit, map, settings.startOfWeek, todayKey),
				month: Math.round(completionRate(habit, map, 30, todayKey) * 100)
			};
		})
	);
</script>

<header class="z-20 shrink-0 border-b pt-safe" style:border-color="var(--product-library-divider-secondary)">
	<div class="measure flex items-center justify-between px-4 pt-2 pb-3">
		<h1 class="text-header md:text-header-large font-bold tracking-tight">Progress</h1>
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
</header>

<main class="measure flex-1 px-4 py-4 pb-20">
	{#if !habits.value.length}
		<p class="dim measure px-8 py-14 text-center text-sm">
			No habits yet. Add one from Habits to start tracking progress.
		</p>
	{:else}
		<section class="raised hairline rounded-2xl border p-4">
			<div class="flex items-center gap-4">
				<ProgressRing
					value={overview.doneToday}
					target={Math.max(1, overview.dueToday)}
					size={76}
					label={`${overview.doneToday}/${overview.dueToday}`}
				/>
				<div class="min-w-0 flex-1">
					<p class="text-sm font-semibold">Today</p>
					<p class="dim text-xs">
						{overview.doneToday} of {overview.dueToday} due habits complete
					</p>
					<p class="dim mt-1 text-caption">
						Weekly habits count toward the current week.
					</p>
				</div>
			</div>

			<div class="mt-4 grid grid-cols-2 gap-2">
				<div class="sunken rounded-2xl px-3 py-3 text-center">
					<p class="text-xl font-bold tabular-nums">
						{percent(overview.seven.done, overview.seven.due)}%
					</p>
					<p class="dim text-caption">Last 7 days</p>
					<p class="dim text-caption tabular-nums">
						{overview.seven.done}/{overview.seven.due} due days
					</p>
				</div>
				<div class="sunken rounded-2xl px-3 py-3 text-center">
					<p class="text-xl font-bold tabular-nums">
						{percent(overview.thirty.done, overview.thirty.due)}%
					</p>
					<p class="dim text-caption">Last 30 days</p>
					<p class="dim text-caption tabular-nums">
						{overview.thirty.done}/{overview.thirty.due} due days
					</p>
				</div>
			</div>
		</section>

		<section class="mt-5">
			<h2 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">Habits</h2>
			<div class="raised hairline overflow-hidden rounded-2xl border">
				{#each rows as row (row.habit.id)}
					<a
						href="/habits/{row.habit.id}"
						class="hairline flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
					>
						<span
							class="grid size-10 shrink-0 place-items-center rounded-xl text-lg"
							style="background: color-mix(in oklch, {row.habit.color} 18%, transparent)"
						>
							{row.habit.emoji}
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-body leading-snug">
								{row.habit.name}
							</span>
							<span class="dim mt-0.5 block text-xs">
								{row.current > 0
									? `🔥 ${row.current} ${row.habit.scheduleKind === 'weekly' ? (row.current === 1 ? 'week' : 'weeks') : (row.current === 1 ? 'day' : 'days')}`
									: 'Start your streak'}
								· Best {row.best} · {row.month}% this month
							</span>
						</span>
						<ProgressRing
							value={row.value}
							target={row.habit.target}
							color={row.habit.color}
							size={44}
							label={row.habit.goal === 'break' || row.habit.kind === 'quantity'
								? `${row.value}/${row.habit.target}`
								: ''}
							invert={row.habit.goal === 'break'}
						/>
					</a>
				{/each}
			</div>
		</section>
	{/if}
</main>
