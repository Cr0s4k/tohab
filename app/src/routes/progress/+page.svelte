<script lang="ts">
	import { goto } from '$app/navigation';
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import type { Habit, HabitLog, HabitRevision } from '$lib/db/schemas';
	import { groupLogs, habitStartDate, habitsQuery, isActiveOn, isPausedOn, logsQuery, periodTarget, revisionsQuery } from '$lib/habits';
	import { humanDay, today } from '$lib/dates';
	import { habitOn, withHabitHistory } from '$lib/habitHistory';
	import { buildHabitProgress, percentage } from '$lib/habitProgress';
	import { settings } from '$lib/settings.svelte';
	import { haptic, hapticTap } from '$lib/haptics';
	import ProgressRing from '$lib/components/ProgressRing.svelte';
	import SettingsButton from '$lib/components/SettingsButton.svelte';
	import DataError from '$lib/components/DataError.svelte';

	function plainDoc<T>(doc: T): T {
		const candidate = doc as T & { toMutableJSON?: () => T };
		return typeof candidate.toMutableJSON === 'function' ? candidate.toMutableJSON() : doc;
	}

	let todayKey = $derived(today());

	let habitDocs = rx<Habit[]>(() => (live.db ? habitsQuery(live.db).$ : null), []);
	let revisionDocs = rx<HabitRevision[]>(() => (live.db ? revisionsQuery(live.db).$ : null), []);
	let logs = rx<HabitLog[]>(() => (live.db ? logsQuery(live.db).$ : null), []);

	let habits = $derived(
		habitDocs.value.map((habit) =>
			withHabitHistory(plainDoc(habit), revisionDocs.value.map((revision) => plainDoc(revision)))
		)
	);
	let progress = $derived(buildHabitProgress(habits, logs.value, settings.startOfWeek, todayKey));
	let overview = $derived(progress.overview);
	let rows = $derived(progress.rows);
	let byHabit = $derived(groupLogs(logs.value));
	let futureCount = $derived(
		habits.filter((habit) => !isActiveOn(habit, todayKey, byHabit.get(habit.id))).length
	);
	let pausedCount = $derived(habits.filter((habit) => isPausedOn(habit, todayKey)).length);
	let queryError = $derived(habitDocs.error ?? revisionDocs.error ?? logs.error);

	function retryQueries() {
		habitDocs.retry?.();
		revisionDocs.retry?.();
		logs.retry?.();
	}
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
	{#if queryError}<DataError label="progress" onRetry={retryQueries} />{/if}
	{#if !habits.length}
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
					{#if futureCount}
						<p class="dim mt-1 text-caption">{futureCount} future {futureCount === 1 ? 'habit' : 'habits'} are shown below.</p>
					{/if}
					{#if pausedCount}
						<p class="dim mt-1 text-caption">{pausedCount} paused {pausedCount === 1 ? 'habit' : 'habits'} are shown below.</p>
					{/if}
					<p class="dim mt-1 text-caption">
						Each scheduled day or week counts once.
					</p>
				</div>
			</div>

			<div class="mt-4 grid grid-cols-2 gap-2">
				<div class="sunken rounded-2xl px-3 py-3 text-center">
					<p class="text-xl font-bold tabular-nums">
						{percentage(overview.seven.done, overview.seven.due)}%
					</p>
					<p class="dim text-caption">Last 7 days</p>
					<p class="dim text-caption tabular-nums">
						{overview.seven.done}/{overview.seven.due} scheduled periods
					</p>
				</div>
				<div class="sunken rounded-2xl px-3 py-3 text-center">
					<p class="text-xl font-bold tabular-nums">
						{percentage(overview.thirty.done, overview.thirty.due)}%
					</p>
					<p class="dim text-caption">Last 30 days</p>
					<p class="dim text-caption tabular-nums">
						{overview.thirty.done}/{overview.thirty.due} scheduled periods
					</p>
				</div>
			</div>
		</section>

		<section class="mt-5">
			<h2 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">Habits</h2>
			<div class="raised hairline overflow-hidden rounded-2xl border">
				{#each rows as row (row.habit.id)}
					{@const habitLogs = byHabit.get(row.habit.id) ?? new Map()}
					{@const active = isActiveOn(row.habit, todayKey, habitLogs)}
					{@const displayHabit = habitOn(row.habit, todayKey)}
					<a
						href="/habits/{row.habit.id}"
						class="hairline flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
					>
						<span
							class="grid size-10 shrink-0 place-items-center rounded-xl text-lg"
							style="background: color-mix(in oklch, {displayHabit.color} 18%, transparent)"
						>
							{displayHabit.emoji}
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-body leading-snug">
								{displayHabit.name}
							</span>
							<span class="dim mt-0.5 block text-xs">
								{!active
									? isPausedOn(row.habit, todayKey)
										? `Paused through ${humanDay(row.habit.pauseUntil!)}`
										: `Starts ${humanDay(habitStartDate(row.habit, habitLogs))}`
									: row.current > 0
										? `🔥 ${row.current} ${displayHabit.scheduleKind === 'weekly' ? (row.current === 1 ? 'week' : 'weeks') : (row.current === 1 ? 'day' : 'days')}`
										: 'Start your streak'}
								{#if active} · Best {row.best} · {row.month}% this month{/if}
							</span>
						</span>
						<ProgressRing
							value={row.value}
							target={periodTarget(displayHabit)}
							color={displayHabit.color}
							size={44}
							label={displayHabit.goal === 'break' || displayHabit.kind === 'quantity' || displayHabit.scheduleKind === 'weekly'
								? `${row.value}/${periodTarget(displayHabit)}`
								: ''}
							invert={displayHabit.goal === 'break'}
						/>
					</a>
				{/each}
			</div>
		</section>
	{/if}
</main>
