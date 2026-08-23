<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import type { Habit, HabitLog } from '$lib/db/schemas';
	import {
		bestStreak,
		completionRate,
		currentStreak,
		habitQuery,
		logsQuery,
		setLog,
		tapLog,
		toLogMap,
		valueOn
	} from '$lib/habits';
	import { humanDay, today, WEEKDAY_NAMES } from '$lib/dates';
	import { settings } from '$lib/settings.svelte';
	import { haptic, hapticTap } from '$lib/haptics';
	import Heatmap from '$lib/components/Heatmap.svelte';
	import HabitEditor from '$lib/components/HabitEditor.svelte';
	import ProgressRing from '$lib/components/ProgressRing.svelte';

	let editing = $state(false);

	let id = $derived(page.params.id ?? '');

	let habitBox = rx<Habit | null>(() => (live.db ? habitQuery(live.db, id).$ : null), null);
	let logBox = rx<HabitLog[]>(() => (live.db ? logsQuery(live.db, id).$ : null), []);

	let habit = $derived(habitBox.value);
	let logs = $derived(toLogMap(logBox.value));
	let todayKey = $derived(today());

	let stats = $derived.by(() => {
		if (!habit) return null;
		return {
			current: currentStreak(habit, logs, settings.startOfWeek, todayKey),
			best: bestStreak(habit, logs, settings.startOfWeek, todayKey),
			month: Math.round(completionRate(habit, logs, 30, todayKey) * 100),
			total:
				habit.goal === 'break'
					? logBox.value.reduce((n, l) => n + l.value, 0)
					: logBox.value.filter((l) => l.value >= habit.target).length
		};
	});

	let scheduleLabel = $derived.by(() => {
		if (!habit) return '';
		if (habit.scheduleKind === 'daily') return 'Every day';
		if (habit.scheduleKind === 'weekly') return `${habit.timesPerWeek}× per week`;
		return habit.weekdays.map((d) => WEEKDAY_NAMES[d].slice(0, 3)).join(', ');
	});

	let streakUnit = $derived(habit?.scheduleKind === 'weekly' ? 'weeks' : 'days');
</script>

<header class="hairline z-20 shrink-0 border-b pt-safe">
	<div class="measure flex items-center gap-3 px-4 pt-2 pb-3">
		<a
			href="/habits"
			use:hapticTap
			onclick={() => haptic('tap')}
			aria-label="Back"
			class="tap dim -ml-1 p-1"
		>
			<svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M15 19l-7-7 7-7" />
			</svg>
		</a>
		<h1 class="min-w-0 flex-1 truncate text-header md:text-header-large font-bold tracking-tight">
			{habit ? `${habit.emoji} ${habit.name}` : 'Habit'}
		</h1>
		<button
			type="button"
			use:hapticTap
			onclick={() => {
				haptic('tap');
				editing = true;
			}}
			class="tap accent-fg text-sm font-medium"
			disabled={!habit}
		>
			Edit
		</button>
	</div>
</header>

<main class="measure flex-1 px-4 py-4">
	{#if !habit}
		<p class="dim py-14 text-center text-sm">
			{habitBox.loading ? 'Loading…' : 'This habit no longer exists.'}
		</p>
	{:else}
		<section class="raised hairline mb-4 flex items-center gap-4 rounded-2xl border p-4">
			<button
				type="button"
				use:hapticTap
				aria-label={habit.goal === 'break' ? 'Log slip today' : 'Log today'}
				onclick={() => {
					haptic(habit.goal === 'break' ? 'warn' : 'success');
					tapLog(habit, todayKey, valueOn(logs, todayKey));
				}}
				class="tap"
			>
				<ProgressRing
					value={valueOn(logs, todayKey)}
					target={habit.target}
					color={habit.color}
					size={64}
					label={habit.goal === 'break' || habit.kind === 'quantity'
						? `${valueOn(logs, todayKey)}/${habit.target}`
						: ''}
					invert={habit.goal === 'break'}
				/>
			</button>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-semibold">Today</p>
				<p class="dim text-xs">
					{habit.goal === 'break' ? 'Break a bad habit' : 'Build a good habit'} · {scheduleLabel}
				</p>
				{#if habit.kind === 'quantity'}
					<div class="mt-2 flex items-center gap-2">
						<button
							type="button"
							aria-label="Decrease"
							onclick={() => setLog(habit, todayKey, valueOn(logs, todayKey) - 1)}
							class="tap sunken grid size-8 place-items-center rounded-lg text-lg font-semibold"
						>
							−
						</button>
						<span class="text-sm tabular-nums">
							{valueOn(logs, todayKey)}{habit.goal === 'break'
								? `/${habit.target}`
								: habit.unit
									? ` ${habit.unit}`
									: ''}
						</span>
						<button
							type="button"
							aria-label="Increase"
							onclick={() => setLog(habit, todayKey, valueOn(logs, todayKey) + 1)}
							class="tap sunken grid size-8 place-items-center rounded-lg text-lg font-semibold"
						>
							+
						</button>
					</div>
				{/if}
			</div>
		</section>

		{#if stats}
			<section class="mb-5 grid grid-cols-4 gap-2">
				{#each [
					{ label: 'Streak', value: stats.current, sub: streakUnit },
					{ label: 'Best', value: stats.best, sub: streakUnit },
					{ label: '30 days', value: `${stats.month}%`, sub: 'done' },
					{
						label: habit.goal === 'break' ? 'Slips' : 'Total',
						value: stats.total,
						sub: habit.goal === 'break' ? 'logged' : 'days'
					}
				] as stat (stat.label)}
					<div class="raised hairline rounded-2xl border px-2 py-3 text-center">
						<p class="text-lg font-bold tabular-nums" style="color: {habit.color}">{stat.value}</p>
						<p class="dim text-caption leading-tight">{stat.label}</p>
						<p class="dim text-caption opacity-70">{stat.sub}</p>
					</div>
				{/each}
			</section>
		{/if}

		<section class="mb-4">
			<div class="mb-2 flex items-baseline justify-between">
				<h2 class="text-sm font-semibold">Last 12 weeks</h2>
				<p class="dim text-caption">Tap a day to backfill</p>
			</div>
			<Heatmap
				{habit}
				{logs}
				weekStartsOn={settings.startOfWeek}
				onToggleDay={(day) => tapLog(habit, day, valueOn(logs, day))}
			/>
		</section>

		<section>
			<h2 class="mb-2 text-sm font-semibold">Recent</h2>
			<div class="raised hairline overflow-hidden rounded-2xl border">
				{#each logBox.value.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10) as log (log.id)}
					<div class="hairline flex items-center justify-between border-b px-4 py-2.5 last:border-b-0">
						<span class="text-sm">{humanDay(log.date)}</span>
						<span class="dim text-sm tabular-nums">
							{habit.goal === 'break'
								? log.value <= habit.target
									? '✓'
									: ''
								: log.value >= habit.target
									? '✓'
									: ''}
							{habit.goal === 'break' || habit.kind === 'quantity'
								? `${log.value}/${habit.target}`
								: ''}
						</span>
					</div>
				{:else}
					<p class="dim px-4 py-6 text-center text-sm">No entries yet.</p>
				{/each}
			</div>
		</section>
	{/if}
</main>

<HabitEditor
	open={editing}
	{habit}
	onClose={() => (editing = false)}
	onDeleted={() => goto('/habits')}
/>
