<script lang="ts">
	import type { Project } from '#lib/db/schemas.js';
	import { parseQuickAdd } from '#lib/parse.js';
	import { createTask, priorityClass, resolveProject } from '#lib/tasks.js';
	import { humanDay, humanTime } from '#lib/dates.js';
	import { describeRepeat, firstDue } from '#lib/repeat.js';
	import { haptic, hapticTap } from '#lib/haptics.js';
	import { reportActionError } from '#lib/actionError.svelte.js';
	import Sheet from './Sheet.svelte';
	import TaskDueControls from './task/TaskDueControls.svelte';
	import TaskPriorityPicker from './task/TaskPriorityPicker.svelte';
	import TaskProjectPicker from './task/TaskProjectPicker.svelte';
	import TaskRepeatPicker from './task/TaskRepeatPicker.svelte';
	import TaskReminderPicker from './task/TaskReminderPicker.svelte';

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

	const panelTitles = {
		date: 'Date',
		repeat: 'Repeat',
		priority: 'Priority',
		project: 'Project',
		reminder: 'Reminders'
	};
	type Panel = 'none' | keyof typeof panelTitles;

	let raw = $state('');
	let inputEl: HTMLInputElement | null = $state(null);
	let parseBase = $state(new Date());
	let panel = $state<Panel>('none');
	let reminderMinutes = $state<number | undefined>(undefined);
	let saving = $state(false);

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
		reminders?: string[];
	}>({});

	let parsed = $derived(raw.trim() ? parseQuickAdd(raw, parseBase) : null);
	let title = $derived(parsed?.title ?? '');
	let repeat = $derived(picked.repeat ?? parsed?.repeat ?? '');
	let due = $derived(
		picked.due ?? parsed?.due ?? defaults.due ?? (repeat ? firstDue(repeat) : '')
	);
	let dueTime = $derived(picked.dueTime ?? parsed?.dueTime ?? '');
	let priority = $derived(picked.priority ?? parsed?.priority ?? 4);
	let reminders = $derived(picked.reminders ?? parsed?.reminders ?? []);

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

	function openPanel(next: Exclude<Panel, 'none'>) {
		haptic('tap');
		panel = next;
	}

	function reset() {
		raw = '';
		parseBase = new Date();
		picked = {};
		panel = 'none';
		reminderMinutes = undefined;
	}

	async function submit(e?: SubmitEvent) {
		e?.preventDefault();
		if (!title || saving) return;
		haptic('success');
		saving = true;
		const add = async () => {
			await createTask({
				title,
				due,
				dueTime,
				repeat,
				priority,
				reminderMinutes,
				reminders,
				projectId:
					projectId ?? (parsed?.project ? await resolveProject(parsed.project) : '')
			});
			reset();
			queueMicrotask(() => inputEl?.focus());
		};
		try {
			await add();
		} catch (caught) {
			reportActionError(caught, add);
		} finally {
			saving = false;
		}
	}

	$effect(() => {
		if (open) {
			parseBase = new Date();
		} else {
			reset();
		}
	});

</script>

<Sheet
	{open}
	covered={panel !== 'none'}
	title="Add task"
	showHeader={false}
	showCloseButton={false}
	safeAreaBottom={false}
	{onClose}
>
	{#snippet children()}
		<form onsubmit={submit} class="flex flex-col gap-3">
			<div class="flex items-center gap-2">
				<!-- svelte-ignore a11y_autofocus (Opening the task dialog focuses its primary input.) -->
				<input
					autofocus
					bind:this={inputEl}
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
					disabled={!title || saving}
					aria-busy={saving}
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
					onclick={() => openPanel('date')}
					class="tap hairline min-h-11 rounded-full border px-3 py-1.5 text-caption font-medium"
					class:accent-fg={Boolean(due)}
					class:dim={!due}
					aria-haspopup="dialog"
					aria-expanded={panel === 'date'}
					class:sunken={panel === 'date'}
				>
					{dateLabel}
				</button>
				<button
					type="button"
					use:hapticTap
					onclick={() => openPanel('repeat')}
					class="tap hairline min-h-11 rounded-full border px-3 py-1.5 text-caption font-medium"
					class:accent-fg={Boolean(repeat)}
					class:dim={!repeat}
					aria-haspopup="dialog"
					aria-expanded={panel === 'repeat'}
					class:sunken={panel === 'repeat'}
				>
					{repeatLabel}
				</button>
				<button
					type="button"
					use:hapticTap
					onclick={() => openPanel('priority')}
					class="tap hairline min-h-11 rounded-full border px-3 py-1.5 text-caption font-medium {priority <
					4
						? priorityClass(priority)
						: 'dim'}"
					aria-haspopup="dialog"
					aria-expanded={panel === 'priority'}
					class:sunken={panel === 'priority'}
				>
					{priority < 4 ? `P${priority}` : 'Priority'}
				</button>
				<button
					type="button"
					use:hapticTap
					onclick={() => openPanel('project')}
					class="tap hairline dim min-h-11 rounded-full border px-3 py-1.5 text-caption font-medium"
					aria-haspopup="dialog"
					aria-expanded={panel === 'project'}
					class:sunken={panel === 'project'}
				>
					{projectLabel}
				</button>
				<button type="button" use:hapticTap onclick={() => openPanel('reminder')} aria-haspopup="dialog" aria-expanded={panel === 'reminder'} class="tap hairline min-h-11 rounded-full border px-3 py-1.5 text-caption font-medium" class:accent-fg={reminders.length > 0} class:dim={!reminders.length} class:sunken={panel === 'reminder'}>
					{reminders.length ? `Reminders · ${reminders.length}` : 'Reminders'}
				</button>
			</div>

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

{#if panel !== 'none'}
	<Sheet
		{open}
		title={panelTitles[panel]}
		onClose={() => (panel = 'none')}
	>
		{#if panel === 'date'}
			<TaskDueControls
				{due}
				{dueTime}
				onDue={(value) => (picked.due = value)}
				onDueTime={(value) => (picked.dueTime = value)}
			/>
		{:else if panel === 'reminder'}
			<TaskReminderPicker
				value={reminderMinutes}
				{dueTime}
				onSelect={(value) => (reminderMinutes = value)}
				{reminders}
				onReminders={(value) => (picked.reminders = value)}
			/>
		{:else if panel === 'repeat'}
			<TaskRepeatPicker value={repeat} onSelect={(value) => (picked.repeat = value)} />
		{:else if panel === 'priority'}
			<TaskPriorityPicker value={priority} onSelect={(value) => (picked.priority = value)} />
		{:else if panel === 'project'}
			<TaskProjectPicker
				{projects}
				value={projectId}
				onSelect={(value) => (picked.projectId = value)}
			/>
		{/if}
	</Sheet>
{/if}
