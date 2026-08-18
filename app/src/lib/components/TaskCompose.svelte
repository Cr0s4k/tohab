<script lang="ts">
	import type { Project } from '$lib/db/schemas';
	import { parseQuickAdd } from '$lib/parse';
	import { createTask, PRIORITY_LABELS, priorityClass, resolveProject } from '$lib/tasks';
	import { humanDay, humanTime, shiftKey, today } from '$lib/dates';
	import { haptic } from '$lib/haptics';
	import { collapse } from '$lib/motion';
	import Sheet from './Sheet.svelte';

	let {
		open = false,
		projects = [],
		defaults = {},
		onClose
	}: {
		open?: boolean;
		projects?: Project[];
		defaults?: { projectId?: string; due?: string };
		onClose: () => void;
	} = $props();

	type Panel = 'none' | 'date' | 'priority' | 'project';

	let raw = $state('');
	let panel = $state<Panel>('none');
	let added = $state(0);
	let input: HTMLInputElement | null = $state(null);

	/**
	 * Typed syntax and tapped chips are the same fields reached two ways, so a tap has to win:
	 * without an explicit override, re-parsing the title would keep resetting the chip.
	 */
	let picked = $state<{ due?: string; dueTime?: string; priority?: number; projectId?: string }>({});

	let parsed = $derived(raw.trim() ? parseQuickAdd(raw) : null);
	let title = $derived(parsed?.title ?? '');
	let due = $derived(picked.due ?? parsed?.due ?? defaults.due ?? '');
	let dueTime = $derived(picked.dueTime ?? parsed?.dueTime ?? '');
	let priority = $derived(picked.priority ?? parsed?.priority ?? 4);

	let projectId = $derived(picked.projectId ?? (parsed?.project ? undefined : defaults.projectId ?? ''));
	let projectLabel = $derived.by(() => {
		if (projectId === undefined) return `#${parsed?.project}`;
		if (!projectId) return 'Inbox';
		return projects.find((p) => p.id === projectId)?.name ?? 'Inbox';
	});

	let dateLabel = $derived(
		due ? `${humanDay(due)}${dueTime ? ` · ${humanTime(dueTime)}` : ''}` : 'Date'
	);

	function toggle(next: Panel) {
		haptic('tap');
		panel = panel === next ? 'none' : next;
	}

	function reset() {
		raw = '';
		picked = {};
		panel = 'none';
	}

	async function submit(e?: SubmitEvent) {
		e?.preventDefault();
		if (!title) return;
		haptic('success');

		await createTask({
			title,
			due,
			dueTime,
			priority,
			projectId:
				projectId ?? (parsed?.project ? await resolveProject(parsed.project) : '')
		});

		added++;
		reset();
		input?.focus();
	}

	// Ready for the next task rather than dismissing: adding several in a row is the whole
	// point of a compose sheet, and the header's Done button is the way out.
	$effect(() => {
		if (!open) {
			reset();
			added = 0;
			return;
		}
		queueMicrotask(() => input?.focus());
	});

	const dateShortcuts = () => [
		{ label: 'Today', value: today() },
		{ label: 'Tomorrow', value: shiftKey(today(), 1) },
		{ label: 'Next week', value: shiftKey(today(), 7) },
		{ label: 'None', value: '' }
	];
</script>

<Sheet {open} title="New task" confirmLabel="Done" onClose={onClose}>
	{#snippet children()}
		<form onsubmit={submit} class="flex flex-col gap-3">
			<input
				bind:this={input}
				bind:value={raw}
				placeholder="What needs doing?"
				enterkeyhint="done"
				autocapitalize="sentences"
				autocomplete="off"
				class="sunken w-full rounded-2xl px-4 py-3 text-[0.95rem] outline-none placeholder:opacity-50"
			/>

			<div class="flex flex-wrap gap-1.5">
				<button
					type="button"
					onclick={() => toggle('date')}
					class="tap hairline rounded-full border px-3 py-1.5 text-[0.78rem] font-medium"
					class:accent-fg={Boolean(due)}
					class:dim={!due}
					class:sunken={panel === 'date'}
				>
					{dateLabel}
				</button>
				<button
					type="button"
					onclick={() => toggle('priority')}
					class="tap hairline rounded-full border px-3 py-1.5 text-[0.78rem] font-medium {priority <
					4
						? priorityClass(priority)
						: 'dim'}"
					class:sunken={panel === 'priority'}
				>
					{priority < 4 ? `P${priority}` : 'Priority'}
				</button>
				<button
					type="button"
					onclick={() => toggle('project')}
					class="tap hairline dim rounded-full border px-3 py-1.5 text-[0.78rem] font-medium"
					class:sunken={panel === 'project'}
				>
					{projectLabel}
				</button>
			</div>

			{#if panel === 'date'}
				<div transition:collapse={{ duration: 200 }}>
					<div class="mb-2 flex flex-wrap gap-1.5">
						{#each dateShortcuts() as s (s.label)}
							<button
								type="button"
								onclick={() => {
									haptic('tap');
									picked.due = s.value;
									if (!s.value) picked.dueTime = '';
								}}
								class="tap rounded-full px-3 py-1.5 text-[0.78rem] font-medium"
								class:accent-bg={due === s.value}
								class:sunken={due !== s.value}
							>
								{s.label}
							</button>
						{/each}
					</div>
					<div class="flex gap-2">
						<input
							type="date"
							value={due}
							onchange={(e) => (picked.due = e.currentTarget.value)}
							class="sunken min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
						/>
						<input
							type="time"
							value={dueTime}
							onchange={(e) => (picked.dueTime = e.currentTarget.value)}
							class="sunken w-28 rounded-xl px-3 py-2.5 text-sm outline-none"
						/>
					</div>
				</div>
			{/if}

			{#if panel === 'priority'}
				<div transition:collapse={{ duration: 200 }} class="flex gap-1.5">
					{#each [1, 2, 3, 4] as p (p)}
						<button
							type="button"
							onclick={() => {
								haptic('tap');
								picked.priority = p;
							}}
							class="tap sunken flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[0.7rem] font-medium"
							class:ring-2={priority === p}
							style="--tw-ring-color: var(--accent)"
						>
							<span class="{priorityClass(p)} text-sm font-bold">P{p}</span>
							<span class="dim">{PRIORITY_LABELS[p]}</span>
						</button>
					{/each}
				</div>
			{/if}

			{#if panel === 'project'}
				<div transition:collapse={{ duration: 200 }} class="flex flex-wrap gap-1.5">
					<button
						type="button"
						onclick={() => {
							haptic('tap');
							picked.projectId = '';
						}}
						class="tap rounded-full px-3 py-1.5 text-[0.78rem] font-medium"
						class:accent-bg={projectId === ''}
						class:sunken={projectId !== ''}
					>
						Inbox
					</button>
					{#each projects as p (p.id)}
						<button
							type="button"
							onclick={() => {
								haptic('tap');
								picked.projectId = p.id;
							}}
							class="tap flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.78rem] font-medium"
							class:accent-bg={projectId === p.id}
							class:sunken={projectId !== p.id}
						>
							<span class="size-2 rounded-full" style="background: {p.color}"></span>
							{p.name}
						</button>
					{/each}
				</div>
			{/if}

			<button
				type="submit"
				disabled={!title}
				class="tap accent-bg rounded-2xl py-3 text-sm font-semibold disabled:opacity-30"
			>
				Add task
			</button>

			<p class="dim text-center text-[0.68rem]">
				{#if parsed?.matched.length}
					Understood: {parsed.matched.join(' · ')}
				{:else if added}
					{added} added · keep going, or Done to close
				{:else}
					Typing “tomorrow 5pm !!1 #work” fills these in too
				{/if}
			</p>
		</form>
	{/snippet}
</Sheet>
