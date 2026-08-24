<script lang="ts">
	import type { Project } from '$lib/db/schemas';
	import { parseQuickAdd } from '$lib/parse';
	import { createTask, priorityClass, resolveProject } from '$lib/tasks';
	import { humanDay, humanTime } from '$lib/dates';
	import { describeRepeat, firstDue } from '$lib/repeat';
	import { haptic, hapticTap } from '$lib/haptics';
	import { collapse } from '$lib/motion';
	import Sheet from './Sheet.svelte';
	import TaskDueControls from './task/TaskDueControls.svelte';
	import TaskPriorityPicker from './task/TaskPriorityPicker.svelte';
	import TaskProjectPicker from './task/TaskProjectPicker.svelte';
	import TaskRepeatPicker from './task/TaskRepeatPicker.svelte';

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

	type Panel = 'none' | 'date' | 'repeat' | 'priority' | 'project';

	let raw = $state('');
	let panel = $state<Panel>('none');
	let input: HTMLInputElement | null = $state(null);

	/**
	 * Typed syntax and tapped chips are the same fields reached two ways, so a tap has to win:
	 * without an explicit override, re-parsing the title would keep resetting the chip.
	 */
	let picked = $state<{
		due?: string;
		dueTime?: string;
		repeat?: string;
		priority?: number;
		projectId?: string;
	}>({});

	let parsed = $derived(raw.trim() ? parseQuickAdd(raw) : null);
	let title = $derived(parsed?.title ?? '');
	let repeat = $derived(picked.repeat ?? parsed?.repeat ?? '');
	let due = $derived(
		picked.due ?? parsed?.due ?? defaults.due ?? (repeat ? firstDue(repeat) : '')
	);
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
	let repeatLabel = $derived(repeat ? describeRepeat(repeat) : 'Repeat');

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
			repeat,
			priority,
			projectId:
				projectId ?? (parsed?.project ? await resolveProject(parsed.project) : '')
		});

		reset();
		onClose();
	}

	$effect(() => {
		if (!open) {
			reset();
			return;
		}
		queueMicrotask(() => input?.focus());
	});

</script>

<Sheet {open} title="New task" confirmLabel="Done" showHeader={false} onClose={onClose}>
	{#snippet children()}
		<form onsubmit={submit} class="flex flex-col gap-3">
			<div class="flex items-center gap-2">
				<input
					bind:this={input}
					bind:value={raw}
					aria-label="Quick add task"
					placeholder="What needs doing?"
					enterkeyhint="done"
					autocapitalize="sentences"
					autocomplete="off"
					class="sunken min-w-0 flex-1 rounded-lg px-3 py-2.5 text-body outline-none placeholder:opacity-50"
				/>
				<button
					type="submit"
					disabled={!title}
					aria-label="Add task"
					class="tap accent-bg grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-30"
				>
					<svg
						viewBox="0 0 24 24"
						class="size-5"
						fill="none"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M12 19V5M5 12l7-7 7 7" />
					</svg>
				</button>
			</div>

			<div class="flex flex-wrap gap-1.5">
				<button
					type="button"
					use:hapticTap
					onclick={() => toggle('date')}
					class="tap hairline min-h-11 rounded-full border px-3 py-1.5 text-caption font-medium"
					class:accent-fg={Boolean(due)}
					class:dim={!due}
					aria-pressed={panel === 'date'}
					class:sunken={panel === 'date'}
				>
					{dateLabel}
				</button>
				<button
					type="button"
					use:hapticTap
					onclick={() => toggle('repeat')}
					class="tap hairline min-h-11 rounded-full border px-3 py-1.5 text-caption font-medium"
					class:accent-fg={Boolean(repeat)}
					class:dim={!repeat}
					aria-pressed={panel === 'repeat'}
					class:sunken={panel === 'repeat'}
				>
					{repeatLabel}
				</button>
				<button
					type="button"
					use:hapticTap
					onclick={() => toggle('priority')}
					class="tap hairline min-h-11 rounded-full border px-3 py-1.5 text-caption font-medium {priority <
					4
						? priorityClass(priority)
						: 'dim'}"
					aria-pressed={panel === 'priority'}
					class:sunken={panel === 'priority'}
				>
					{priority < 4 ? `P${priority}` : 'Priority'}
				</button>
				<button
					type="button"
					use:hapticTap
					onclick={() => toggle('project')}
					class="tap hairline dim min-h-11 rounded-full border px-3 py-1.5 text-caption font-medium"
					aria-pressed={panel === 'project'}
					class:sunken={panel === 'project'}
				>
					{projectLabel}
				</button>
			</div>

			{#if panel === 'date'}
				<div transition:collapse={{ duration: 200 }}>
					<TaskDueControls
						{due}
						{dueTime}
						onDue={(value) => (picked.due = value)}
						onDueTime={(value) => (picked.dueTime = value)}
					/>
				</div>
			{/if}

			{#if panel === 'repeat'}
				<div transition:collapse={{ duration: 200 }}>
					<TaskRepeatPicker value={repeat} onSelect={(value) => (picked.repeat = value)} />
				</div>
			{/if}

			{#if panel === 'priority'}
				<div transition:collapse={{ duration: 200 }}>
					<TaskPriorityPicker value={priority} onSelect={(value) => (picked.priority = value)} />
				</div>
			{/if}

			{#if panel === 'project'}
				<div transition:collapse={{ duration: 200 }}>
					<TaskProjectPicker {projects} value={projectId} onSelect={(value) => (picked.projectId = value)} />
				</div>
			{/if}

			<p class="dim text-center text-caption">
				{#if parsed?.matched.length}
					Understood: {parsed.matched.join(' · ')}
				{:else}
					Typing “every friday 5pm !!1 #work” fills these in too
				{/if}
			</p>
		</form>
	{/snippet}
</Sheet>
