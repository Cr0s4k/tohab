<script lang="ts">
	import type { Project, Task } from '#lib/db/schemas.js';
	import {
		createTask,
		deleteTask,
		directSubtasksQuery,
		toggleTask,
		updateTask
	} from '#lib/tasks.js';
	import { live } from '#lib/db/live.svelte.js';
	import { rx } from '#lib/rx.svelte.js';
	import { haptic, hapticTap } from '#lib/haptics.js';
	import { reportActionError } from '#lib/actionError.svelte.js';
	import Sheet from './Sheet.svelte';
	import TaskDueControls from './task/TaskDueControls.svelte';
	import TaskPriorityPicker from './task/TaskPriorityPicker.svelte';
	import TaskProjectPicker from './task/TaskProjectPicker.svelte';
	import TaskRepeatPicker from './task/TaskRepeatPicker.svelte';
	import TaskReminderPicker from './task/TaskReminderPicker.svelte';
	import DataError from './DataError.svelte';

	let {
		task,
		projects,
		onClose,
		onOpenTask
	}: {
		task: Task | null;
		projects: Project[];
		onClose: () => void;
		onOpenTask?: (task: Task) => void;
	} = $props();

	let draft = $state({
		title: '',
		notes: '',
		due: '',
		dueTime: '',
		repeat: '',
		reminderMinutes: undefined as number | undefined,
		reminders: [] as string[],
		priority: 4,
		projectId: ''
	});
	let id = $state('');
	let loadedTaskId = $state('');
	let subtasksExpandedForId = $state('');
	let subtasksOpen = $state(false);
	let scheduleOpen = $state(false);
	let organizationOpen = $state(false);
	let addingSubtask = $state(false);
	let subtaskTitle = $state('');
	let subtaskInput = $state<HTMLInputElement | null>(null);
	let saving = $state(false);
	let confirmingDelete = $state(false);
	let deleting = $state(false);
	let subtasks = rx<Task[]>(
		() => (live.db && id ? directSubtasksQuery(live.db, id).$ : null),
		[]
	);

	$effect(() => {
		if (!task) {
			loadedTaskId = '';
			confirmingDelete = false;
			return;
		}
		if (loadedTaskId !== task.id) {
			loadedTaskId = task.id;
			confirmingDelete = false;
			subtasksExpandedForId = '';
			subtasksOpen = false;
			scheduleOpen = Boolean(task.due || task.dueTime || task.repeat || task.reminderMinutes !== undefined || task.reminders?.length);
			organizationOpen = task.priority !== 4 || Boolean(task.projectId);
		}
		id = task.id;
		draft = {
			title: task.title,
			notes: task.notes,
			due: task.due,
			dueTime: task.dueTime,
			repeat: task.repeat ?? '',
			reminderMinutes: task.reminderMinutes,
			reminders: [...(task.reminders ?? [])],
			priority: task.priority,
			projectId: task.projectId
		};
		addingSubtask = false;
		subtaskTitle = '';
	});

	$effect(() => {
		if (!id || !subtasks.value.some((subtask) => subtask.parentId === id) || subtasksExpandedForId === id) return;
		subtasksExpandedForId = id;
		subtasksOpen = true;
	});

	async function save() {
		if (!id || saving) return;
		const title = draft.title.trim();
		if (!title) return;
		saving = true;
		try {
			await updateTask(id, { ...$state.snapshot(draft), title });
		} finally {
			saving = false;
		}
	}

	async function saveAndClose() {
		try {
			await save();
			onClose();
		} catch (caught) {
			reportActionError(caught, () => saveAndClose());
		}
	}

	async function beginSubtask() {
		try {
			await save();
			addingSubtask = true;
			queueMicrotask(() => subtaskInput?.focus());
		} catch (caught) {
			reportActionError(caught, () => beginSubtask());
		}
	}

	async function addSubtask() {
		if (!task || !subtaskTitle.trim()) return;
		const title = subtaskTitle;
		const add = async () => {
			await createTask({ title, parentId: id, projectId: draft.projectId });
			subtaskTitle = '';
			addingSubtask = false;
		};
		try {
			await add();
		} catch (caught) {
			reportActionError(caught, add);
		}
	}

	async function openSubtask(subtask: Task) {
		try {
			await save();
			onOpenTask?.(subtask);
		} catch (caught) {
			reportActionError(caught, () => openSubtask(subtask));
		}
	}

	async function confirmDelete() {
		if (!id || deleting) return;
		deleting = true;
		const remove = async () => {
			await deleteTask(id);
			onClose();
		};
		try {
			haptic('warn');
			await remove();
		} catch (caught) {
			reportActionError(caught, remove);
		} finally {
			deleting = false;
		}
	}

</script>

<Sheet
	open={Boolean(task)}
	title="Task"
	confirmLabel="Save"
	onClose={onClose}
	onConfirm={saveAndClose}
>
	{#snippet children()}
		<div class="flex flex-col gap-4">
			<input
				bind:value={draft.title}
				placeholder="Title"
				class="sunken w-full rounded-lg px-3 py-2.5 text-body outline-none"
			/>

			<textarea
				bind:value={draft.notes}
				placeholder="Notes"
				rows="3"
				class="sunken w-full resize-none rounded-lg px-3 py-2.5 text-copy outline-none placeholder:opacity-50"
			></textarea>

			<details bind:open={subtasksOpen} aria-label="Subtasks" class="task-editor-section hairline overflow-hidden rounded-xl border">
				<summary class="tap flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3 py-2.5">
					<span class="text-copy font-semibold">Subtasks</span>
					<span class="flex items-center gap-2">
						{#if subtasks.value.length}
							<span class="dim text-caption">{subtasks.value.filter((subtask) => subtask.done).length}/{subtasks.value.length}</span>
						{/if}
						<svg viewBox="0 0 24 24" class="task-editor-section__chevron size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="m6 9 6 6 6-6"></path>
						</svg>
					</span>
				</summary>
				<div class="hairline border-t px-3 pt-2 pb-3">
					{#if subtasks.error}<DataError label="subtasks" onRetry={() => subtasks.retry?.()} />{/if}
					<div class="flex justify-end">
						<button
							type="button"
							onclick={beginSubtask}
							class="tap accent-fg min-h-11 rounded-lg px-2 py-1 text-caption font-semibold"
						>
							+ Add subtask
						</button>
					</div>
					{#if subtasks.value.length}
						<ul class="sunken mt-1 divide-y rounded-xl px-3" style="border-color: var(--hairline)">
							{#each subtasks.value as subtask (subtask.id)}
								<li class="flex items-center gap-3 py-2">
									<button
										type="button"
										role="checkbox"
										aria-checked={subtask.done}
										aria-label={subtask.done ? `Reopen ${subtask.title}` : `Complete ${subtask.title}`}
										onclick={() => void toggleTask(subtask.id).catch((caught) => reportActionError(caught, () => toggleTask(subtask.id)))}
										class="tap grid size-11 shrink-0 place-items-center rounded-full border text-caption"
									>
										{subtask.done ? '✓' : ''}
									</button>
									<button
										type="button"
										onclick={() => openSubtask(subtask)}
										class="min-w-0 flex-1 truncate py-1 text-left text-copy"
										class:line-through={subtask.done}
										class:dim={subtask.done}
									>
										{subtask.title}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					{#if addingSubtask}
						<form onsubmit={(event) => { event.preventDefault(); addSubtask(); }} class="mt-2 flex gap-2">
							<input
								bind:this={subtaskInput}
								bind:value={subtaskTitle}
								aria-label="Subtask title"
								placeholder="Subtask title"
								class="sunken min-w-0 flex-1 rounded-lg px-3 py-2 text-copy outline-none"
							/>
							<button type="submit" disabled={!subtaskTitle.trim()} class="tap accent-bg rounded-lg px-3 text-copy font-semibold disabled:opacity-40">
								Add
							</button>
						</form>
					{/if}
				</div>
			</details>

			<details bind:open={scheduleOpen} class="task-editor-section hairline overflow-hidden rounded-xl border">
				<summary class="tap flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3 py-2.5">
					<span class="text-copy font-semibold">Schedule</span>
					<svg viewBox="0 0 24 24" class="task-editor-section__chevron size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="m6 9 6 6 6-6"></path>
					</svg>
				</summary>
				<div class="hairline flex flex-col gap-4 border-t px-3 py-3">
					<div>
						<p class="dim mb-1.5 text-caption font-semibold tracking-wide uppercase">Due</p>
						<TaskDueControls due={draft.due} dueTime={draft.dueTime} onDue={(value) => (draft.due = value)} onDueTime={(value) => (draft.dueTime = value)} showSummary />
					</div>

					<div>
						<p class="dim mb-1.5 text-caption font-semibold tracking-wide uppercase">Repeat</p>
						<TaskRepeatPicker value={draft.repeat} onSelect={(value) => (draft.repeat = value)} showDescription />
					</div>

					<div>
						<p class="dim mb-1.5 text-caption font-semibold tracking-wide uppercase">Reminder</p>
						<TaskReminderPicker value={draft.reminderMinutes} dueTime={draft.dueTime} onSelect={(value) => (draft.reminderMinutes = value)} reminders={draft.reminders} onReminders={(value) => (draft.reminders = value)} />
					</div>
				</div>
			</details>

			<details bind:open={organizationOpen} class="task-editor-section hairline overflow-hidden rounded-xl border">
				<summary class="tap flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3 py-2.5">
					<span class="text-copy font-semibold">Organization</span>
					<svg viewBox="0 0 24 24" class="task-editor-section__chevron size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="m6 9 6 6 6-6"></path>
					</svg>
				</summary>
				<div class="hairline flex flex-col gap-4 border-t px-3 py-3">
					<div>
						<p class="dim mb-1.5 text-caption font-semibold tracking-wide uppercase">Priority</p>
						<TaskPriorityPicker value={draft.priority} onSelect={(value) => (draft.priority = value)} />
					</div>

					<div>
						<p class="dim mb-1.5 text-caption font-semibold tracking-wide uppercase">Project</p>
						<TaskProjectPicker {projects} value={draft.projectId} onSelect={(value) => (draft.projectId = value)} variant="select" />
					</div>
				</div>
			</details>

			<div class="flex gap-2 pt-1">
				<button
					type="button"
					onclick={() => void saveAndClose()}
					disabled={saving}
					class="tap accent-bg flex-1 rounded-lg py-2.5 text-body font-semibold disabled:opacity-40"
				>
					{saving ? 'Saving…' : 'Save'}
				</button>
				{#if confirmingDelete}
					<div class="sunken flex-1 rounded-xl p-2" role="alert">
						<p class="danger text-xs font-medium">Delete this task?</p>
						<div class="mt-1 flex gap-1">
							<button type="button" class="tap danger-bg rounded-lg px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-40" disabled={deleting} onclick={() => void confirmDelete()}>{deleting ? 'Deleting…' : 'Delete'}</button>
							<button type="button" class="tap dim rounded-lg px-2 py-1.5 text-xs" disabled={deleting} onclick={() => (confirmingDelete = false)}>Cancel</button>
						</div>
					</div>
				{:else}
					<button type="button" use:hapticTap onclick={() => (confirmingDelete = true)} class="tap sunken danger rounded-lg px-5 py-2.5 text-body font-semibold">
						Delete
					</button>
				{/if}
			</div>
		</div>
	{/snippet}
</Sheet>

<style>
	.task-editor-section > summary {
		list-style: none;
	}

	.task-editor-section > summary::-webkit-details-marker {
		display: none;
	}

	.task-editor-section__chevron {
		transition: transform 150ms ease;
	}

	.task-editor-section[open] .task-editor-section__chevron {
		transform: rotate(180deg);
	}
</style>
