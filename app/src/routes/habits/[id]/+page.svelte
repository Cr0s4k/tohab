<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import type { Habit, HabitEntryAction, HabitLog, HabitRevision, HabitView } from '$lib/db/schemas';
	import {
		bestStreak,
		completionRate,
		currentStreak,
		habitStartDate,
		habitQuery,
		entryActionsQuery,
		isActiveOn,
		isPausedOn,
		logsQuery,
		revisionsQuery,
		setLog,
		tapLog,
		touchEntry,
		toLogMap,
		isWeeklyQuantity,
		periodValue,
		periodTarget,
		valueOn
	} from '$lib/habits';
	import { humanDay, today, WEEKDAY_NAMES } from '$lib/dates';
	import { compareRevisions, habitOn, withHabitHistory } from '$lib/habitHistory';
	import { settings } from '$lib/settings.svelte';
	import { haptic, hapticTap } from '$lib/haptics';
	import { reportActionError } from '$lib/actionError.svelte';
	import DataError from '$lib/components/DataError.svelte';
	import Heatmap from '$lib/components/Heatmap.svelte';
	import HabitLogEditor from '$lib/components/HabitLogEditor.svelte';
	import HabitEditor from '$lib/components/HabitEditor.svelte';
	import ProgressRing from '$lib/components/ProgressRing.svelte';

	function plainDoc<T>(doc: T): T {
		const candidate = doc as T & { toMutableJSON?: () => T };
		return typeof candidate.toMutableJSON === 'function' ? candidate.toMutableJSON() : doc;
	}

	let editing = $state(false);
	let logDay = $state<string | null>(null);

	let id = $derived(page.params.id ?? '');

	let habitBox = rx<Habit | null>(() => (live.db ? habitQuery(live.db, id).$ : null), null);
	let revisionBox = rx<HabitRevision[]>(() => (live.db ? revisionsQuery(live.db, id).$ : null), []);
	let logBox = rx<HabitLog[]>(() => (live.db ? logsQuery(live.db, id).$ : null), []);
	let actionBox = rx<HabitEntryAction[]>(() => (live.db ? entryActionsQuery(live.db, id).$ : null), []);

	let habit = $derived(
		habitBox.value
			? withHabitHistory(plainDoc(habitBox.value), revisionBox.value.map((revision) => plainDoc(revision)))
			: null
	);
	let logs = $derived(toLogMap(logBox.value));
	let todayKey = $derived(today());
	let todayHabit = $derived(habit ? habitOn(habit, todayKey) : null);
	let startDate = $derived(habit ? habitStartDate(habit, logs) : '');
	let activeToday = $derived(todayHabit ? isActiveOn(todayHabit, todayKey, logs) : false);
	let pausedToday = $derived(todayHabit ? isPausedOn(todayHabit, todayKey) : false);
	let queryError = $derived(habitBox.error ?? revisionBox.error ?? logBox.error ?? actionBox.error);

	function retryQueries() {
		habitBox.retry?.();
		revisionBox.retry?.();
		logBox.retry?.();
		actionBox.retry?.();
	}

	function runLog(action: () => Promise<void>) {
		void action().catch((caught) => reportActionError(caught, action));
	}

	function openLogEditor(date: string) {
		logDay = date;
		if (!habit) return;
		const selectedHabit = habitOn(habit, date);
		if (isActiveOn(selectedHabit, date, logs)) runLog(() => touchEntry(selectedHabit, date));
	}

	let lastActionAt = $derived(logDay ? actionBox.value.find((action) => action.date === logDay)?.lastActionAt : undefined);

	let stats = $derived.by(() => {
		if (!habit) return null;
		return {
			current: currentStreak(habit, logs, settings.startOfWeek, todayKey),
			best: bestStreak(habit, logs, settings.startOfWeek, todayKey),
			month: Math.round(completionRate(habit, logs, 30, todayKey, settings.startOfWeek) * 100),
		};
	});

	let totalStat = $derived.by(() => {
		if (!habit || !todayHabit) return { label: 'Total', value: 0 as number | string, sub: 'days' };
		const entries = logBox.value
			.filter((log) => log.date >= startDate && log.date <= todayKey)
			.map((log) => ({ log, rule: habitOn(habit, log.date) }));
		const label = todayHabit.goal === 'break' ? 'Slips' : 'Total';
		if (todayHabit.kind === 'quantity') {
			const semantics = [...new Set(entries.map(({ rule }) => `${rule.goal}:${rule.kind}:${rule.unit.trim() || 'times'}`))];
			const units = [...new Set(entries.map(({ rule }) => rule.unit.trim() || 'times'))];
			if (semantics.length > 1 || units.length > 1) return { label: 'Entries', value: entries.length, sub: 'logged' };
			return { label, value: entries.reduce((total, { log }) => total + log.value, 0), sub: units[0] ?? (todayHabit.unit || 'times') };
		}
		return { label, value: entries.filter(({ log, rule }) => log.value >= rule.target).length, sub: 'days' };
	});

	let scheduleLabel = $derived.by(() => {
		if (!todayHabit) return '';
		if (isWeeklyQuantity(todayHabit)) return `${todayHabit.goal === 'break' ? 'At most' : 'At least'} ${todayHabit.target} ${todayHabit.unit || 'times'} per week`;
		if (todayHabit.scheduleKind === 'daily') return 'Every day';
		if (todayHabit.scheduleKind === 'weekly') return `${todayHabit.timesPerWeek}× per week`;
		return todayHabit.weekdays.map((d) => WEEKDAY_NAMES[d].slice(0, 3)).join(', ');
	});

	let streakUnit = $derived(todayHabit?.scheduleKind === 'weekly' ? 'weeks' : 'days');
	let pendingRevision = $derived.by(() => {
		if (!habit) return null;
		const upcoming = habit.revisions?.filter((revision) => revision.effectiveFrom > todayKey).sort(compareRevisions) ?? [];
		const firstDate = upcoming[0]?.effectiveFrom;
		return firstDate ? upcoming.filter((revision) => revision.effectiveFrom === firstDate).sort(compareRevisions).at(-1) ?? null : null;
	});
	let cadenceSwitch = $derived.by(() => {
		const revisions = habit?.revisions ?? [];
		return revisions.some((revision, index) => index > 0 && (revision.scheduleKind === 'weekly') !== (revisions[index - 1].scheduleKind === 'weekly'));
	});
</script>

<header class="hairline z-20 shrink-0 border-b pt-safe">
	<div class="measure-gutter flex items-center gap-3 px-4 pt-2 pb-3">
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

<main class="min-w-0 flex-1">
	<div class="measure px-4 py-4" style="padding-bottom: max(1rem, env(safe-area-inset-bottom))">
		{#if queryError}<DataError label="habit details" onRetry={retryQueries} />{/if}
		{#if !habit}
			<p class="dim py-14 text-center text-sm">
				{habitBox.loading ? 'Loading…' : 'This habit no longer exists.'}
			</p>
		{:else}
			{@const currentHabit = todayHabit!}
			<section class="raised hairline mb-4 flex items-center gap-4 rounded-2xl border p-4">
				<button
					type="button"
					use:hapticTap
					aria-label={activeToday ? (currentHabit.kind === 'quantity' ? 'Edit today’s entry' : 'Log today') : pausedToday ? `Paused through ${humanDay(currentHabit.pauseUntil!)}` : `Starts ${humanDay(startDate)}`}
					disabled={!activeToday}
					onclick={() => {
						haptic(currentHabit.goal === 'break' ? 'warn' : 'success');
						if (currentHabit.kind === 'quantity') openLogEditor(todayKey);
						else runLog(() => tapLog(currentHabit, todayKey, valueOn(logs, todayKey)));
					}}
					class="tap disabled:opacity-50"
				>
					<ProgressRing
						value={periodValue(currentHabit, logs, todayKey, settings.startOfWeek)}
						target={periodTarget(currentHabit)}
						color={currentHabit.color}
						size={64}
						label={currentHabit.goal === 'break' || currentHabit.kind === 'quantity' || currentHabit.scheduleKind === 'weekly'
							? `${periodValue(currentHabit, logs, todayKey, settings.startOfWeek)}/${periodTarget(currentHabit)}`
							: ''}
						invert={currentHabit.goal === 'break'}
					/>
				</button>
				<div class="min-w-0 flex-1">
					<p class="text-sm font-semibold">{activeToday ? (currentHabit.scheduleKind === 'weekly' ? 'This week' : 'Today') : pausedToday ? `Paused through ${humanDay(currentHabit.pauseUntil!)}` : `Starts ${humanDay(startDate)}`}</p>
					<p class="dim text-xs">
						{currentHabit.goal === 'break' ? 'Break a bad habit' : 'Build a good habit'} · {scheduleLabel}
					</p>
					<p class="dim mt-1 text-caption">{pausedToday ? 'Entries before the pause are still included.' : `Starts ${humanDay(startDate)}`}</p>
					{#if pendingRevision}
						<p class="dim mt-1 text-caption">Tracking changes start {humanDay(pendingRevision.effectiveFrom)}.</p>
					{/if}
					{#if currentHabit.kind === 'quantity'}
						<div class="mt-2 flex items-center gap-2">
							<button
								type="button"
								aria-label="Decrease"
								disabled={!activeToday}
								onclick={() => runLog(() => setLog(currentHabit, todayKey, valueOn(logs, todayKey) - 1))}
								class="tap sunken grid size-8 place-items-center rounded-lg text-lg font-semibold disabled:opacity-50"
							>
								−
							</button>
							<button type="button" aria-label="Edit today’s amount" disabled={!activeToday} onclick={() => openLogEditor(todayKey)} class="tap min-h-11 px-2 text-sm tabular-nums underline underline-offset-4 disabled:opacity-50">
								{valueOn(logs, todayKey)}{currentHabit.goal === 'break'
									? (isWeeklyQuantity(currentHabit) ? ' today' : `/${currentHabit.target}`)
									: currentHabit.unit
										? ` ${currentHabit.unit}`
										: ''}
							</button>
							<button
								type="button"
								aria-label="Increase"
								disabled={!activeToday}
								onclick={() => runLog(() => setLog(currentHabit, todayKey, valueOn(logs, todayKey) + 1))}
								class="tap sunken grid size-8 place-items-center rounded-lg text-lg font-semibold disabled:opacity-50"
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
							totalStat
						] as stat (stat.label)}
						<div class="raised hairline rounded-2xl border px-2 py-3 text-center">
							<p class="text-lg font-bold tabular-nums" style="color: {currentHabit.color}">{stat.value}</p>
							<p class="dim text-caption leading-tight">{stat.label}</p>
							<p class="dim text-caption opacity-70">{stat.sub}</p>
						</div>
					{/each}
				</section>
			{/if}
			{#if cadenceSwitch}
				<p class="dim mb-4 text-caption">Streaks count from the latest switch between daily and weekly tracking.</p>
			{/if}

			<section class="mb-4">
				<div class="mb-2 flex items-baseline justify-between">
					<h2 class="text-sm font-semibold">Last 12 weeks</h2>
					<p class="dim text-caption">Tap a day to edit</p>
				</div>
				<Heatmap
					{habit}
					{logs}
					weekStartsOn={settings.startOfWeek}
					onToggleDay={openLogEditor}
				/>
			</section>

			<section>
				<h2 class="mb-2 text-sm font-semibold">Recent</h2>
				<div class="raised hairline overflow-hidden rounded-2xl border">
					{#each logBox.value.filter((log) => log.date >= startDate && log.date <= todayKey).slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10) as log (log.id)}
						{@const entryHabit = habitOn(habit, log.date)}
						<div class="hairline flex items-center justify-between border-b px-4 py-2.5 last:border-b-0">
							<span class="text-sm">{humanDay(log.date)}</span>
							<span class="dim text-sm tabular-nums">
								{isWeeklyQuantity(entryHabit) ? '' : entryHabit.goal === 'break'
									? log.value <= entryHabit.target
										? '✓'
										: ''
									: log.value >= entryHabit.target
										? '✓'
										: ''}
								{entryHabit.goal === 'break' || entryHabit.kind === 'quantity'
									? (isWeeklyQuantity(entryHabit) ? `${log.value} ${entryHabit.unit || 'times'}` : `${log.value}/${entryHabit.target}`)
									: ''}
							</span>
						</div>
					{:else}
						<p class="dim px-4 py-6 text-center text-sm">
							{activeToday ? 'No entries yet.' : `Starts on ${humanDay(startDate)}. Entries will appear here.`}
						</p>
					{/each}
				</div>
			</section>
		{/if}
	</div>
</main>

<HabitEditor
	open={editing}
	{habit}
	{logs}
	onClose={() => (editing = false)}
	onDeleted={() => goto('/habits')}
/>

{#if logDay && habit}
	<HabitLogEditor habit={habitOn(habit, logDay)} day={logDay} value={valueOn(logs, logDay)} {lastActionAt} {logs} onClose={() => (logDay = null)} />
{/if}
