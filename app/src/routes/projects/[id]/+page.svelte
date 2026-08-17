<script lang="ts">
	import { page } from '$app/state';
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import type { Task } from '$lib/db/schemas';
	import {
		deleteTask,
		projectTasksQuery,
		projectsQuery,
		sortTasks,
		toggleTask
	} from '$lib/tasks';
	import Fab from '$lib/components/Fab.svelte';
	import TaskCompose from '$lib/components/TaskCompose.svelte';
	import TaskRow from '$lib/components/TaskRow.svelte';
	import TaskEditor from '$lib/components/TaskEditor.svelte';

	let editing = $state<Task | null>(null);
	let showDone = $state(false);
	let composing = $state(false);

	// The Inbox is the absence of a project, so it gets a reserved route id.
	let projectId = $derived(page.params.id === 'inbox' ? '' : (page.params.id ?? ''));

	let projects = rx(() => (live.db ? projectsQuery(live.db).$ : null), []);
	let tasks = rx<Task[]>(
		() => (live.db ? projectTasksQuery(live.db, projectId, showDone).$ : null),
		[]
	);

	let project = $derived(projects.value.find((p) => p.id === projectId));
	let title = $derived(projectId === '' ? 'Inbox' : (project?.name ?? 'Project'));
	let sorted = $derived(sortTasks(tasks.value));
</script>

<header class="hairline raised sticky top-0 z-20 border-b pt-safe">
	<div class="flex items-center gap-3 px-4 pt-2 pb-3">
		<a href="/projects" aria-label="Back" class="tap dim -ml-1 p-1">
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
			onclick={() => (showDone = !showDone)}
			class="tap sunken hairline rounded-full border px-3 py-1 text-[0.7rem] font-medium"
		>
			{showDone ? 'Open' : 'Done'}
		</button>
	</div>
</header>

<main class="flex-1 pb-20">
	{#if !sorted.length}
		<p class="dim px-8 py-14 text-center text-sm">
			{showDone ? 'Nothing completed here yet.' : 'No tasks in this project.'}
		</p>
	{:else}
		{#each sorted as task (task.id)}
			<TaskRow
				{task}
				onToggle={() => toggleTask(task.id)}
				onDelete={() => deleteTask(task.id)}
				onOpen={() => (editing = task)}
			/>
		{/each}
	{/if}
</main>

<Fab label="New task in {title}" onPress={() => (composing = true)} />

<TaskCompose
	open={composing}
	projects={projects.value}
	defaults={{ projectId }}
	onClose={() => (composing = false)}
/>

<TaskEditor task={editing} projects={projects.value} onClose={() => (editing = null)} />
