<script lang="ts">
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import { createProject, deleteProject, openTasksQuery, projectsQuery, renameProject } from '$lib/tasks';
	import { haptic, hapticTap } from '$lib/haptics';
	import { flip } from 'svelte/animate';
	import { collapse, flipCfg } from '$lib/motion';

	let name = $state('');
	let renaming = $state<string | null>(null);
	let renameValue = $state('');

	let projects = rx(() => (live.db ? projectsQuery(live.db).$ : null), []);
	let open = rx(() => (live.db ? openTasksQuery(live.db).$ : null), []);

	let counts = $derived.by(() => {
		const map = new Map<string, number>();
		for (const t of open.value) map.set(t.projectId, (map.get(t.projectId) ?? 0) + 1);
		return map;
	});

	function submit(e: SubmitEvent) {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		haptic('success');
		createProject(trimmed);
		name = '';
	}

	function commitRename(id: string) {
		if (renameValue.trim()) renameProject(id, renameValue);
		renaming = null;
	}
</script>

<header class="hairline z-20 shrink-0 border-b pt-safe">
	<div class="measure flex items-center gap-3 px-4 pt-2 pb-3">
		<a href="/tasks" aria-label="Back" class="tap dim -ml-1 p-1">
			<svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M15 19l-7-7 7-7" />
			</svg>
		</a>
		<h1 class="text-2xl font-bold tracking-tight">Projects</h1>
	</div>
</header>

<main class="flex-1">
	<a href="/projects/inbox" class="raised hairline block border-b px-4 py-3.5">
		<span class="measure flex items-center gap-3">
			<span class="size-3 rounded-full" style="background: var(--text-dim)"></span>
			<span class="flex-1 text-[0.95rem]">Inbox</span>
			<span class="dim text-sm tabular-nums">{counts.get('') ?? 0}</span>
		</span>
	</a>

	{#each projects.value as project (project.id)}
		<div
			transition:collapse
			animate:flip={flipCfg}
			class="raised hairline border-b px-4 py-3.5"
		>
			<div class="measure flex items-center gap-3">
				<span class="size-3 shrink-0 rounded-full" style="background: {project.color}"></span>
				{#if renaming === project.id}
					<input
						bind:value={renameValue}
						onblur={() => commitRename(project.id)}
						onkeydown={(e) => e.key === 'Enter' && commitRename(project.id)}
						class="sunken min-w-0 flex-1 rounded-lg px-2 py-1 text-[0.95rem] outline-none"
					/>
				{:else}
					<a href="/projects/{project.id}" class="min-w-0 flex-1 truncate text-[0.95rem]">
						{project.name}
					</a>
					<span class="dim text-sm tabular-nums">{counts.get(project.id) ?? 0}</span>
					<button
						type="button"
						aria-label="Rename {project.name}"
						onclick={() => {
							renaming = project.id;
							renameValue = project.name;
						}}
						class="tap dim p-1 text-xs"
					>
						Edit
					</button>
					<button
						type="button"
						use:hapticTap
						aria-label="Delete {project.name}"
						onclick={() => {
							haptic('warn');
							deleteProject(project.id);
						}}
						class="tap danger p-1 text-xs"
					>
						Delete
					</button>
				{/if}
			</div>
		</div>
	{/each}

	<p class="dim px-4 py-3 text-[0.68rem]">
		Deleting a project keeps its tasks and moves them to the Inbox.
	</p>
</main>

<form onsubmit={submit} class="raised hairline border-t px-3 pt-2.5 pb-safe">
	<div class="measure flex gap-2">
		<input
			bind:value={name}
			placeholder="New project…"
			class="sunken min-w-0 flex-1 rounded-2xl px-4 py-3 text-[0.95rem] outline-none placeholder:opacity-50"
		/>
		<button
			type="submit"
			use:hapticTap
			disabled={!name.trim()}
			class="tap accent-bg rounded-2xl px-5 text-sm font-semibold disabled:opacity-30"
		>
			Add
		</button>
	</div>
</form>
