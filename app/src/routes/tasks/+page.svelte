<script lang="ts">
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import type { Task } from '$lib/db/schemas';
	import { deleteTask, projectsQuery, tasksQuery, toggleTask, type View } from '$lib/tasks';
	import { arrangeTasks } from '$lib/arrange';
	import { isCustomised, viewOptions } from '$lib/viewOptions.svelte';
	import { daysFromToday, today } from '$lib/dates';
	import Fab from '$lib/components/Fab.svelte';
	import TaskCompose from '$lib/components/TaskCompose.svelte';
	import TaskRow from '$lib/components/TaskRow.svelte';
	import TaskEditor from '$lib/components/TaskEditor.svelte';
	import ViewOptionsSheet from '$lib/components/ViewOptionsSheet.svelte';
	import SyncBadge from '$lib/components/SyncBadge.svelte';
	import { flip } from 'svelte/animate';
	import { collapse, flipCfg, veil } from '$lib/motion';

	const VIEWS: { id: View; label: string }[] = [
		{ id: 'today', label: 'Today' },
		{ id: 'upcoming', label: 'Upcoming' },
		{ id: 'inbox', label: 'All' }
	];

	let view = $state<View>('today');
	let editing = $state<Task | null>(null);
	let composing = $state(false);
	let tuning = $state(false);

	let opts = $derived(viewOptions(view));

	let tasks = rx<Task[]>(
		() => (live.db ? tasksQuery(live.db, view, opts.showDone).$ : null),
		[]
	);
	let projects = rx(() => (live.db ? projectsQuery(live.db).$ : null), []);

	let projectById = $derived(new Map(projects.value.map((p) => [p.id, p])));
	let groups = $derived(arrangeTasks(tasks.value, opts, projects.value));
	let count = $derived(groups.reduce((n, g) => n + g.tasks.length, 0));

	let overdueCount = $derived(
		view === 'today'
			? tasks.value.filter((t) => !t.done && t.due && daysFromToday(t.due) < 0).length
			: 0
	);

	const emptyCopy: Record<View, string> = {
		today: 'Nothing due today. Enjoy it.',
		upcoming: 'No scheduled tasks ahead.',
		inbox: 'No open tasks. Tap + to add one.'
	};
</script>

<header class="hairline sticky top-0 z-20 raised border-b pt-safe">
	<div class="flex items-center justify-between px-4 pt-2 pb-2">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Tasks</h1>
			{#if overdueCount > 0}
				<p class="text-xs font-medium" style="color: oklch(0.62 0.2 25)">
					{overdueCount} overdue
				</p>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			<SyncBadge />
			<button
				type="button"
				onclick={() => (tuning = true)}
				aria-label="Sort and group"
				class="tap hairline relative grid size-8 place-items-center rounded-full border"
				class:accent-bg={isCustomised(view)}
				class:sunken={!isCustomised(view)}
			>
				<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
					<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
					<circle cx="16" cy="6" r="2" />
					<circle cx="10" cy="12" r="2" />
					<circle cx="18" cy="18" r="2" />
				</svg>
			</button>
			<a
				href="/projects"
				aria-label="Projects"
				class="tap sunken hairline grid size-8 place-items-center rounded-full border"
			>
				<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
					<path d="M3 6h18M3 12h18M3 18h18" />
				</svg>
			</a>
		</div>
	</div>

	<div class="flex gap-1.5 overflow-x-auto px-4 pb-2.5">
		{#each VIEWS as v (v.id)}
			<button
				type="button"
				onclick={() => (view = v.id)}
				class="tap shrink-0 rounded-full px-3 py-1.5 text-[0.8rem] font-medium"
				class:accent-bg={view === v.id}
				class:sunken={view !== v.id}
				class:dim={view !== v.id}
			>
				{v.label}
			</button>
		{/each}
	</div>
</header>

<main class="flex-1 pb-20">
	{#if tasks.loading && !tasks.value.length}
		<p class="dim px-4 py-10 text-center text-sm">Loading…</p>
	{:else if !count}
		<p class="dim px-8 py-14 text-center text-sm" in:veil>{emptyCopy[view]}</p>
	{:else}
		{#each groups as group (group.key)}
			{#if group.label}
				<h2
					transition:collapse
					class="sunken dim flex items-center justify-between px-4 py-1.5 text-[0.7rem] font-semibold tracking-wide uppercase"
				>
					<span>{group.label}</span>
					<span>{group.tasks.length}</span>
				</h2>
			{/if}
			{#each group.tasks as task (task.id)}
				<div transition:collapse animate:flip={flipCfg}>
					<TaskRow
						{task}
						project={projectById.get(task.projectId)}
						onToggle={() => toggleTask(task.id)}
						onDelete={() => deleteTask(task.id)}
						onOpen={() => (editing = task)}
					/>
				</div>
			{/each}
		{/each}
		<p class="dim px-4 py-4 text-center text-[0.68rem]">Swipe a task right to complete, left to delete</p>
	{/if}
</main>

<Fab label="New task" onPress={() => (composing = true)} />

<TaskCompose
	open={composing}
	projects={projects.value}
	defaults={{ due: view === 'today' ? today() : undefined }}
	onClose={() => (composing = false)}
/>

<TaskEditor
	task={editing}
	projects={projects.value}
	onClose={() => (editing = null)}
/>

<ViewOptionsSheet
	open={tuning}
	scope={view}
	onClose={() => (tuning = false)}
/>
