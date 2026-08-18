<script lang="ts">
	import { page } from '$app/state';
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import type { Task } from '$lib/db/schemas';
	import { deleteTask, projectTasksQuery, projectsQuery, toggleTask } from '$lib/tasks';
	import { arrangeTasks } from '$lib/arrange';
	import { isCustomised, projectScope, viewOptions } from '$lib/viewOptions.svelte';
	import Fab from '$lib/components/Fab.svelte';
	import { taskCompose } from '$lib/compose.svelte';
	import TaskCompose from '$lib/components/TaskCompose.svelte';
	import TaskRow from '$lib/components/TaskRow.svelte';
	import TaskEditor from '$lib/components/TaskEditor.svelte';
	import ViewOptionsSheet from '$lib/components/ViewOptionsSheet.svelte';

	let editing = $state<Task | null>(null);
	let tuning = $state(false);

	// The Inbox is the absence of a project, so it gets a reserved route id.
	let projectId = $derived(page.params.id === 'inbox' ? '' : (page.params.id ?? ''));
	let scope = $derived(projectScope(projectId));
	let opts = $derived(viewOptions(scope));

	let projects = rx(() => (live.db ? projectsQuery(live.db).$ : null), []);
	let tasks = rx<Task[]>(
		() => (live.db ? projectTasksQuery(live.db, projectId, opts.showDone).$ : null),
		[]
	);

	let project = $derived(projects.value.find((p) => p.id === projectId));
	let title = $derived(projectId === '' ? 'Inbox' : (project?.name ?? 'Project'));
	let groups = $derived(arrangeTasks(tasks.value, opts, projects.value));
	let count = $derived(groups.reduce((n, g) => n + g.tasks.length, 0));
</script>

<header class="hairline z-20 shrink-0 border-b pt-safe">
	<div class="measure flex items-center gap-3 px-4 pt-2 pb-3">
		<a href="/browse" aria-label="Back" class="tap dim -ml-1 p-1">
			<svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M15 19l-7-7 7-7" />
			</svg>
		</a>
		{#if project}
			<span class="size-3 shrink-0 rounded-full" style="background: {project.color}"></span>
		{/if}
		<h1 class="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight">{title}</h1>
		<button
			type="button"
			onclick={() => (tuning = true)}
			aria-label="Sort and group"
			class="tap hairline grid size-8 shrink-0 place-items-center rounded-full border"
			class:accent-bg={isCustomised(scope)}
			class:sunken={!isCustomised(scope)}
		>
			<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
				<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
				<circle cx="16" cy="6" r="2" />
				<circle cx="10" cy="12" r="2" />
				<circle cx="18" cy="18" r="2" />
			</svg>
		</button>
	</div>
</header>

<main class="flex-1 pb-20">
	{#if !count}
		<p class="dim measure px-8 py-14 text-center text-sm">No tasks in this project.</p>
	{:else}
		{#each groups as group (group.key)}
			{#if group.label}
				<h2
					class="sunken dim sticky top-0 z-10 px-4 py-1.5 text-[0.7rem] font-semibold tracking-wide uppercase"
				>
					<span class="measure flex items-center justify-between">
						<span>{group.label}</span>
						<span>{group.tasks.length}</span>
					</span>
				</h2>
			{/if}
			{#each group.tasks as task (task.id)}
				<TaskRow
					{task}
					onToggle={() => toggleTask(task.id)}
					onDelete={() => deleteTask(task.id)}
					onOpen={() => (editing = task)}
				/>
			{/each}
		{/each}
	{/if}
</main>

<Fab label="New task in {title}" mobileOnly onPress={() => (taskCompose.open = true)} />

<TaskCompose
	open={taskCompose.open}
	projects={projects.value}
	defaults={{ projectId }}
	onClose={() => (taskCompose.open = false)}
/>

<TaskEditor task={editing} projects={projects.value} onClose={() => (editing = null)} />

<ViewOptionsSheet
	open={tuning}
	scope={scope}
	title="Sort & group {title}"
	onClose={() => (tuning = false)}
/>
