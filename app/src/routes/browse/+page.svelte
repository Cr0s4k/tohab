<script lang="ts">
	import { live } from '#lib/db/live.svelte.js';
	import { rx } from '#lib/rx.svelte.js';
	import { createProject, deleteProject, openTasksQuery, projectsQuery, renameProject } from '#lib/tasks.js';
	import { activityCountQuery } from '#lib/activity.js';
	import { haptic, hapticTap } from '#lib/haptics.js';
	import { reportActionError } from '#lib/actionError.svelte.js';
	import { flip } from 'svelte/animate';
	import { collapse, flipCfg } from '#lib/motion.js';
	import SettingsButton from '#lib/components/SettingsButton.svelte';
	import DataError from '#lib/components/DataError.svelte';

	let name = $state('');
	let adding = $state(false);
	let renaming = $state<string | null>(null);
	let renameValue = $state('');
	let input: HTMLInputElement | null = $state(null);
	let mainEl = $state<HTMLElement | null>(null);
	let scrolled = $state(false);
	let saving = $state(false);
	let confirmingDelete = $state<string | null>(null);
	let deleting = $state<string | null>(null);

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
		if (!trimmed || saving) return;
		haptic('success');
		saving = true;
		const add = async () => {
			await createProject(trimmed);
			name = '';
			adding = false;
		};
		try {
			await add();
		} catch (caught) {
			reportActionError(caught, add);
		} finally {
			saving = false;
		}
	}

	function cancelAdd() {
		name = '';
		adding = false;
	}

	function startRename(id: string, current: string) {
		renaming = id;
		renameValue = current;
	}

	async function commitRename(id: string) {
		const nextName = renameValue.trim();
		renaming = null;
		if (!nextName) return;
		const rename = () => renameProject(id, nextName);
		try {
			await rename();
		} catch (caught) {
			reportActionError(caught, rename);
		}
	}

	async function confirmProjectDelete(id: string) {
		if (deleting) return;
		deleting = id;
		const remove = async () => {
			await deleteProject(id);
			confirmingDelete = null;
		};
		try {
			haptic('warn');
			await remove();
		} catch (caught) {
			reportActionError(caught, remove);
		} finally {
			deleting = null;
		}
	}

	function retryQueries() {
		projects.retry?.();
		open.retry?.();
		activityCount.retry?.();
	}

	let queryError = $derived(projects.error ?? open.error ?? activityCount.error);
</script>

<header
	class="z-20 shrink-0 pt-safe"
	style:border-color="var(--product-library-divider-secondary)"
	class:border-b={scrolled}
>
	<div class="measure-gutter relative flex items-center justify-between px-4 pt-2 pb-2">
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
	{#if queryError}<DataError label="Browse" onRetry={retryQueries} />{/if}
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
			<form onsubmit={submit} class="surface px-4">
				<div class="hairline measure flex gap-2 border-b py-3">
					<input
						bind:this={input}
						bind:value={name}
						placeholder="New project…"
						class="sunken min-w-0 flex-1 rounded-xl px-3 py-2 text-copy outline-none placeholder:opacity-50"
					/>
					<button
						type="submit"
						use:hapticTap
						disabled={!name.trim() || saving}
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
					{#if confirmingDelete === project.id}
						<div class="min-w-0 flex-1">
							<p class="danger text-xs font-medium">Delete “{project.name}” and move its tasks to Inbox?</p>
							<div class="mt-2 flex gap-2">
								<button type="button" class="tap danger-bg rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-40" disabled={deleting === project.id} onclick={() => void confirmProjectDelete(project.id)}>{deleting === project.id ? 'Deleting…' : 'Delete'}</button>
								<button type="button" class="tap sunken rounded-lg px-3 py-2 text-xs font-medium" disabled={deleting === project.id} onclick={() => (confirmingDelete = null)}>Cancel</button>
							</div>
						</div>
					{:else if renaming === project.id}
						<input
							bind:value={renameValue}
							onblur={() => void commitRename(project.id)}
							onkeydown={(e) => e.key === 'Enter' && void commitRename(project.id)}
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
								confirmingDelete = project.id;
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
