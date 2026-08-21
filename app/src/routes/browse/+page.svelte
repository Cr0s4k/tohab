<script lang="ts">
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import { createProject, deleteProject, openTasksQuery, projectsQuery, renameProject } from '$lib/tasks';
	import { activityCountQuery } from '$lib/activity';
	import { haptic, hapticTap } from '$lib/haptics';
	import { flip } from 'svelte/animate';
	import { collapse, flipCfg } from '$lib/motion';
	import SettingsButton from '$lib/components/SettingsButton.svelte';

	let name = $state('');
	let adding = $state(false);
	let renaming = $state<string | null>(null);
	let renameValue = $state('');
	let input: HTMLInputElement | null = $state(null);
	let mainEl = $state<HTMLElement | null>(null);
	let scrolled = $state(false);

	let projects = rx(() => (live.db ? projectsQuery(live.db).$ : null), []);
	let open = rx(() => (live.db ? openTasksQuery(live.db).$ : null), []);
	let activityCount = rx(() => (live.db ? activityCountQuery(live.db).$ : null), 0);

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

<header
	class="z-20 shrink-0 pt-safe"
	style:border-color="var(--product-library-divider-secondary)"
	class:border-b={scrolled}
>
	<div class="measure relative flex items-center justify-between px-4 pt-2 pb-2">
		<h1
			class="text-header md:text-header-large font-bold tracking-tight transition-opacity duration-200"
			class:opacity-0={scrolled}
		>
			Browse
		</h1>
		<div
			class="pointer-events-none absolute inset-x-0 top-0 bottom-0 flex items-center justify-center transition-opacity duration-200"
			class:opacity-0={!scrolled}
			aria-hidden={!scrolled}
		>
			<span class="text-header md:text-header-large font-bold tracking-tight">Browse</span>
		</div>
		<SettingsButton />
	</div>
</header>

<main
	class="flex-1 pb-20"
	bind:this={mainEl}
	onscroll={() => (scrolled = (mainEl?.scrollTop ?? 0) > 0)}
>
	<section>
		<div class="surface sticky top-0 z-10 px-4 pt-1.5 pb-0 text-copy font-semibold tracking-wide">
			<div class="hairline measure flex items-center justify-between border-b pb-1.5">
				<h2>Projects</h2>
				<button
					type="button"
					use:hapticTap
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
		</div>

		{#if adding}
			<form onsubmit={submit} class="hairline surface border-b px-4 py-3">
				<div class="measure flex gap-2">
					<input
						bind:this={input}
						bind:value={name}
						placeholder="New project…"
						class="sunken min-w-0 flex-1 rounded-xl px-3 py-2 text-copy outline-none placeholder:opacity-50"
					/>
					<button
						type="submit"
						use:hapticTap
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
				</div>
			</form>
		{/if}

		<a
			href="/projects/inbox"
			class="pressable surface block px-4 pt-3.5 pb-0"
		>
			<span class="hairline measure flex items-center gap-3 border-b pb-3.5">
				<span class="size-3 rounded-full" style="background: var(--text-dim)"></span>
				<span class="flex-1 text-body">Inbox</span>
				<span class="dim text-sm tabular-nums">{counts.get('') ?? 0}</span>
			</span>
		</a>

		{#each projects.value as project (project.id)}
			<div
				transition:collapse
				animate:flip={flipCfg}
				class="pressable surface px-4 pt-3.5 pb-0"
			>
				<div class="hairline measure flex items-center gap-3 border-b pb-3.5">
					<span class="size-3 shrink-0 rounded-full" style="background: {project.color}"></span>
					{#if renaming === project.id}
						<input
							bind:value={renameValue}
							onblur={() => commitRename(project.id)}
							onkeydown={(e) => e.key === 'Enter' && commitRename(project.id)}
							class="sunken min-w-0 flex-1 rounded-lg px-2 py-1 text-body outline-none"
						/>
					{:else}
						<a href="/projects/{project.id}" class="min-w-0 flex-1 truncate text-body">
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

		<p class="dim measure px-4 py-4 text-center text-caption">
			Deleting a project keeps its tasks and moves them to the Inbox.
		</p>
	</section>

	<section>
		<div class="surface sticky top-0 z-10 px-4 pt-1.5 pb-0 text-copy font-semibold tracking-wide">
			<h2 class="hairline measure border-b pb-1.5">
				History
			</h2>
		</div>

		<a href="/activity" class="pressable surface block px-4 pt-3.5 pb-0">
			<span class="hairline measure flex items-center gap-3 border-b pb-3.5">
				<svg
					viewBox="0 0 24 24"
					class="dim size-4 shrink-0"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M3 12a9 9 0 109-9 9 9 0 00-7.6 4.2M3 4v3.6h3.6M12 7.5V12l3 2" />
				</svg>
				<span class="min-w-0 flex-1">
					<span class="block text-body">Activity</span>
					<span class="faint block text-caption">Recent changes</span>
				</span>
				<span class="dim text-sm tabular-nums">{activityCount.value}</span>
			</span>
		</a>
	</section>

</main>
