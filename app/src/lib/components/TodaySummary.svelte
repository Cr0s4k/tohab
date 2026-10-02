<script lang="ts">
	import { live } from '#lib/db/live.svelte.js';
	import { rx } from '#lib/rx.svelte.js';
	import type { Habit, HabitLog, HabitRevision } from '#lib/db/schemas.js';
	import { habitsQuery, logsQuery, revisionsQuery } from '#lib/habits.js';
	import { withHabitHistory } from '#lib/habitHistory.js';
	import { buildHabitProgress } from '#lib/habitProgress.js';
	import { settings } from '#lib/settings.svelte.js';
	import { today } from '#lib/dates.js';
	import { collapse, veil } from '#lib/motion.js';
	import DataError from './DataError.svelte';
	import ProgressRing from './ProgressRing.svelte';

	function plainDoc<T>(doc: T): T {
		const candidate = doc as T & { toMutableJSON?: () => T };
		return typeof candidate.toMutableJSON === 'function' ? candidate.toMutableJSON() : doc;
	}

	let habitDocs = rx<Habit[]>(() => (live.db ? habitsQuery(live.db).$ : null), []);
	let revisionDocs = rx<HabitRevision[]>(() => (live.db ? revisionsQuery(live.db).$ : null), []);
	let logs = rx<HabitLog[]>(() => (live.db ? logsQuery(live.db).$ : null), []);

	let habits = $derived(
		habitDocs.value.map((habit) =>
			withHabitHistory(plainDoc(habit), revisionDocs.value.map((revision) => plainDoc(revision)))
		)
	);
	let progress = $derived(buildHabitProgress(habits, logs.value, settings.startOfWeek, today()));
	let overview = $derived(progress.overview);
	let queryError = $derived(habitDocs.error ?? revisionDocs.error ?? logs.error);

	function retryQueries() {
		habitDocs.retry?.();
		revisionDocs.retry?.();
		logs.retry?.();
	}
</script>

{#if queryError}
	<DataError label="today’s habits" onRetry={retryQueries} />
{:else if !habitDocs.loading && overview.dueToday > 0}
	<a transition:collapse href="/habits" class="pressable hairline block border-b" aria-label="Open today’s habit journal">
		<span class="measure-gutter flex items-center gap-3 px-4 py-3">
			<ProgressRing
				value={overview.doneToday}
				target={Math.max(1, overview.dueToday)}
				size={38}
				color="var(--accent)"
				label={`${overview.doneToday}/${overview.dueToday}`}
			/>
			<span class="min-w-0 flex-1">
				<span class="block text-sm font-semibold">Today’s habits</span>
				{#key `${overview.doneToday}:${overview.dueToday}`}
					<span in:veil={{ duration: 160 }} class="dim block text-xs">{overview.doneToday} of {overview.dueToday} complete · Open journal →</span>
				{/key}
			</span>
		</span>
	</a>
{/if}
