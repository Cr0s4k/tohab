<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import type { Task } from '$lib/db/schemas';
	import { deleteTask, projectsQuery, tasksQuery, toggleTask, type View } from '$lib/tasks';
	import { arrangeTasks } from '$lib/arrange';
	import { isCustomised, viewOptions } from '$lib/viewOptions.svelte';
	import { daysFromToday, today } from '$lib/dates';
	import Fab from '$lib/components/Fab.svelte';
	import { taskCompose } from '$lib/compose.svelte';
	import TaskCompose from '$lib/components/TaskCompose.svelte';
	import TaskRow from '$lib/components/TaskRow.svelte';
	import TaskEditor from '$lib/components/TaskEditor.svelte';
	import ViewOptionsSheet from '$lib/components/ViewOptionsSheet.svelte';
	import SettingsButton from '$lib/components/SettingsButton.svelte';
	import { haptic, hapticTap } from '$lib/haptics';
	import { flip } from 'svelte/animate';
	import { collapse, flipCfg, veil } from '$lib/motion';

	function viewFromUrl(): View {
		const value = page.url.searchParams.get('view');
		return value === 'inbox' || value === 'today' || value === 'upcoming' ? value : 'today';
	}

	let view = $derived(viewFromUrl());
	let editing = $state<Task | null>(null);
	let tuning = $state(false);
	let mainEl = $state<HTMLElement | null>(null);
	let scrolled = $state(false);

	const viewTitles: Record<View, string> = {
		inbox: 'Inbox',
		today: 'Today',
		upcoming: 'Upcoming',
		all: 'Tasks'
	};

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
		inbox: 'Inbox is clear. Unfiled tasks land here.',
		today: 'Nothing due today. Enjoy it.',
		upcoming: 'No scheduled tasks ahead.',
		all: 'No open tasks. Tap + to add one.'
	};
</script>

<header
	class="z-20 shrink-0 pt-safe"
	style:border-color="var(--product-library-divider-secondary)"
	class:border-b={scrolled}
>
	<div class="measure relative flex items-center justify-between px-4 pt-2 pb-2">
		<div class="flex items-center gap-2">
			<h1
				class="min-w-0 truncate text-header md:text-header-large font-bold tracking-tight transition-opacity duration-200"
				class:opacity-0={scrolled}
			>
				{viewTitles[view]}
			</h1>
			{#if overdueCount > 0}
				<p class="danger text-xs font-medium">
					{overdueCount} overdue
				</p>
			{/if}
		</div>
		<div
			class="pointer-events-none absolute inset-x-0 top-0 bottom-0 flex items-center justify-center transition-opacity duration-200"
			class:opacity-0={!scrolled}
			aria-hidden={!scrolled}
		>
			<span class="text-header md:text-header-large font-bold tracking-tight">
				{viewTitles[view]}
			</span>
		</div>
		<div class="flex items-center gap-2">
			<button
				type="button"
				use:hapticTap
				onclick={() => {
					haptic('tap');
					tuning = true;
				}}
				aria-label="Sort and group"
				class="tap hairline relative grid size-9 place-items-center rounded-full border md:size-8"
				class:accent-bg={isCustomised(view)}
				class:sunken={!isCustomised(view)}
			>
				<svg viewBox="0 0 24 24" class="size-[1.05rem] md:size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
					<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
					<circle cx="16" cy="6" r="2" />
					<circle cx="10" cy="12" r="2" />
					<circle cx="18" cy="18" r="2" />
				</svg>
			</button>
			<button
				type="button"
				use:hapticTap
				onclick={() => {
					haptic('tap');
					goto(`/habits?from=${view}`);
				}}
				aria-label="Switch to Habits"
				class="tap sunken hairline grid size-9 place-items-center rounded-full border md:hidden"
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

<main class="flex-1 pb-20" bind:this={mainEl} onscroll={() => (scrolled = (mainEl?.scrollTop ?? 0) > 0)}>
	{#if tasks.loading && !tasks.value.length}
		<p class="dim measure px-4 py-10 text-center text-sm">Loading…</p>
	{:else if !count}
		<p class="dim measure px-8 py-14 text-center text-sm" in:veil>{emptyCopy[view]}</p>
	{:else}
		{#each groups as group (group.key)}
			{#if group.label}
				<h2
					transition:collapse
					class="surface sticky top-0 z-10 px-4 pt-1.5 pb-0 text-copy font-semibold tracking-wide"
				>
					<span class="hairline measure flex items-center justify-between border-b pb-1.5">
						<span>{group.label}</span>
						<span>{group.tasks.length}</span>
					</span>
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
		<p class="dim measure px-4 py-4 text-center text-caption md:hidden">Swipe a task right to complete, left to delete</p>
	{/if}
</main>

<Fab label="New task" mobileOnly onPress={() => (taskCompose.open = true)} />

<TaskCompose
	open={taskCompose.open}
	projects={projects.value}
	defaults={{ due: view === 'today' ? today() : undefined }}
	onClose={() => (taskCompose.open = false)}
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
