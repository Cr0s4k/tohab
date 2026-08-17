<script lang="ts">
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import { createProject, deleteProject, openTasksQuery, projectsQuery, renameProject } from '$lib/tasks';
	import { haptic } from '$lib/haptics';
	import { flip } from 'svelte/animate';
	import { collapse, flipCfg } from '$lib/motion';
	import SyncBadge from '$lib/components/SyncBadge.svelte';

	let name = $state('');
	let adding = $state(false);
	let renaming = $state<string | null>(null);
	let renameValue = $state('');
	let input: HTMLInputElement | null = $state(null);

	let projects = rx(() => (live.db ? projectsQuery(live.db).$ : null), []);
	let open = rx(() => (live.db ? openTasksQuery(live.db).$ : null), []);

	let counts = $derived.by(() => {
		const map = new Map<string, number>();
		for (const t of open.value) map.set(t.projectId, (map.get(t.projectId) ?? 0) + 1);
		return map;
	});

	$effect(() => {
		if (adding) queueMicrotask(() => input?.focus());
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		haptic('success');
		await createProject(trimmed);
		name = '';
		adding = false;
	}

	function cancelAdd() {
		name = '';
		adding = false;
	}

	function startRename(id: string, current: string) {
		renaming = id;
		renameValue = current;
	}

	function commitRename(id: string) {
		if (renameValue.trim()) renameProject(id, renameValue);
		renaming = null;
	}
</script>

<header class="hairline raised z-20 shrink-0 border-b pt-safe">
	<div class="flex items-center justify-between px-4 pt-2 pb-3">
		<h1 class="text-2xl font-bold tracking-tight">Browse</h1>
		<div class="flex items-center gap-2">
			<SyncBadge />
			<a
				href="/settings"
				aria-label="Settings"
				class="tap sunken hairline grid size-8 place-items-center rounded-full border"
			>
				<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2v.2a2 2 0 01-4 0v-.1a1.7 1.7 0 00-2.9-1.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1A1.7 1.7 0 003.6 14H3.4a2 2 0 010-4h.2a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 012.8-2.8l.1.1A1.7 1.7 0 0010 3.6V3.4a2 2 0 014 0v.2a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 012.8 2.8l-.1.1A1.7 1.7 0 0021 10h.2a2 2 0 010 4H21a1.7 1.7 0 00-1.6 1z" />
				</svg>
			</a>
		</div>
	</div>
</header>

<main class="flex-1">
	<section>
		<div class="flex items-center justify-between px-4 pt-3 pb-1.5">
			<h2 class="dim text-[0.7rem] font-semibold tracking-wide uppercase">Projects</h2>
			<button
				type="button"
				aria-label="Add project"
				onclick={() => {
					haptic('tap');
					adding = !adding;
				}}
				class="tap accent-bg grid size-8 place-items-center rounded-full"
			>
				<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
					<path d="M12 5v14M5 12h14" />
				</svg>
			</button>
		</div>

		{#if adding}
			<form
				onsubmit={submit}
				class="hairline raised flex gap-2 border-y px-4 py-3"
			>
				<input
					bind:this={input}
					bind:value={name}
					placeholder="New project…"
					class="sunken min-w-0 flex-1 rounded-xl px-3 py-2 text-[0.9rem] outline-none placeholder:opacity-50"
				/>
				<button
					type="submit"
					disabled={!name.trim()}
					class="tap accent-bg rounded-xl px-4 text-sm font-semibold disabled:opacity-30"
				>
					Add
				</button>
				<button
					type="button"
					onclick={cancelAdd}
					class="tap sunken rounded-xl px-3 text-sm font-medium"
				>
					Cancel
				</button>
			</form>
		{/if}

		<a href="/projects/inbox" class="raised hairline flex items-center gap-3 border-b px-4 py-3.5">
			<span class="size-3 rounded-full" style="background: var(--text-dim)"></span>
			<span class="flex-1 text-[0.95rem]">Inbox</span>
			<span class="dim text-sm tabular-nums">{counts.get('') ?? 0}</span>
		</a>

		{#each projects.value as project (project.id)}
			<div
				transition:collapse
				animate:flip={flipCfg}
				class="raised hairline flex items-center gap-3 border-b px-4 py-3.5"
			>
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
						onclick={() => startRename(project.id, project.name)}
						class="tap dim p-1 text-xs"
					>
						Edit
					</button>
					<button
						type="button"
						aria-label="Delete {project.name}"
						onclick={() => {
							haptic('warn');
							deleteProject(project.id);
						}}
						class="tap p-1 text-xs"
						style="color: oklch(0.62 0.2 25)"
					>
						Delete
					</button>
				{/if}
			</div>
		{/each}

		<p class="dim px-4 py-3 text-[0.68rem]">
			Deleting a project keeps its tasks and moves them to the Inbox.
		</p>
	</section>

	<section class="px-4 pb-4">
		<h2 class="dim pt-4 pb-1.5 text-[0.7rem] font-semibold tracking-wide uppercase">Filters</h2>
		<div class="raised hairline rounded-2xl border px-4 py-6 text-center">
			<p class="dim text-sm">Filters are coming soon.</p>
		</div>
	</section>
</main>
