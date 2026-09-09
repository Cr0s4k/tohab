<script lang="ts">
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import type { Habit, HabitLog, HabitRevision } from '$lib/db/schemas';
	import { habitsQuery, logsQuery, revisionsQuery } from '$lib/habits';
	import { withHabitHistory } from '$lib/habitHistory';
	import { buildHabitProgress } from '$lib/habitProgress';
	import { settings } from '$lib/settings.svelte';
	import { today } from '$lib/dates';
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
	<a href="/habits" class="pressable hairline flex items-center gap-3 border-b px-4 py-3" aria-label="Open today’s habit journal">
		<ProgressRing
			value={overview.doneToday}
			target={Math.max(1, overview.dueToday)}
			size={38}
			color="var(--accent)"
			label={`${overview.doneToday}/${overview.dueToday}`}
		/>
		<span class="min-w-0 flex-1">
			<span class="block text-sm font-semibold">Today’s habits</span>
			<span class="dim block text-xs">{overview.doneToday} of {overview.dueToday} complete · Open journal →</span>
		</span>
	</a>
{/if}
