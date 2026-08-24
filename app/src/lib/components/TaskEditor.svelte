<script lang="ts">
	import type { Project, Task } from '$lib/db/schemas';
	import {
		createTask,
		deleteTask,
		directSubtasksQuery,
		toggleTask,
		updateTask
	} from '$lib/tasks';
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import { haptic, hapticTap } from '$lib/haptics';
	import Sheet from './Sheet.svelte';
	import TaskDueControls from './task/TaskDueControls.svelte';
	import TaskPriorityPicker from './task/TaskPriorityPicker.svelte';
	import TaskRepeatPicker from './task/TaskRepeatPicker.svelte';

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
		priority: 4,
		projectId: ''
	});
	let id = $state('');
	let addingSubtask = $state(false);
	let subtaskTitle = $state('');
	let subtaskInput = $state<HTMLInputElement | null>(null);
	let subtasks = rx<Task[]>(
		() => (live.db && id ? directSubtasksQuery(live.db, id).$ : null),
		[]
	);

	$effect(() => {
		if (!task) return;
		id = task.id;
		draft = {
			title: task.title,
			notes: task.notes,
			due: task.due,
			dueTime: task.dueTime,
			repeat: task.repeat ?? '',
			priority: task.priority,
			projectId: task.projectId
		};
		addingSubtask = false;
		subtaskTitle = '';
	});

	async function save() {
		if (!id) return;
		const title = draft.title.trim();
		if (!title) return;
		await updateTask(id, { ...$state.snapshot(draft), title });
	}

	function close() {
		save().then(onClose);
	}

	async function beginSubtask() {
		await save();
		addingSubtask = true;
		queueMicrotask(() => subtaskInput?.focus());
	}

	async function addSubtask() {
		if (!task || !subtaskTitle.trim()) return;
		await createTask({ title: subtaskTitle, parentId: id, projectId: draft.projectId });
		subtaskTitle = '';
		addingSubtask = false;
	}

	async function openSubtask(subtask: Task) {
		await save();
		onOpenTask?.(subtask);
	}

</script>

<Sheet open={Boolean(task)} title="Task" confirmLabel="Save" onClose={close}>
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

			<div>
				<p class="dim mb-1.5 text-caption font-semibold tracking-wide uppercase">Due</p>
				<TaskDueControls due={draft.due} dueTime={draft.dueTime} onDue={(value) => (draft.due = value)} onDueTime={(value) => (draft.dueTime = value)} showSummary />
			</div>

			<div>
				<p class="dim mb-1.5 text-caption font-semibold tracking-wide uppercase">Repeat</p>
				<TaskRepeatPicker value={draft.repeat} onSelect={(value) => (draft.repeat = value)} showDescription />
			</div>

			<div>
				<p class="dim mb-1.5 text-caption font-semibold tracking-wide uppercase">Priority</p>
				<TaskPriorityPicker value={draft.priority} onSelect={(value) => (draft.priority = value)} />
			</div>

			<div>
				<p class="dim mb-1.5 text-caption font-semibold tracking-wide uppercase">Project</p>
				<select
					bind:value={draft.projectId}
					class="sunken w-full rounded-xl px-3 py-2.5 text-copy outline-none"
				>
					<option value="">Inbox</option>
					{#each projects as p (p.id)}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			</div>

			<div aria-label="Subtasks">
				<div class="mb-1.5 flex items-center justify-between">
					<p class="dim text-caption font-semibold tracking-wide uppercase">Subtasks</p>
					<button
						type="button"
						onclick={beginSubtask}
						class="tap accent-fg min-h-11 rounded-lg px-2 py-1 text-caption font-semibold"
					>
						+ Add subtask
					</button>
				</div>
				{#if subtasks.value.length}
					<ul class="sunken divide-y rounded-xl px-3" style="border-color: var(--hairline)">
						{#each subtasks.value as subtask (subtask.id)}
							<li class="flex items-center gap-3 py-2">
								<button
									type="button"
									role="checkbox"
									aria-checked={subtask.done}
									aria-label={subtask.done ? `Reopen ${subtask.title}` : `Complete ${subtask.title}`}
									onclick={() => toggleTask(subtask.id)}
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

			<div class="flex gap-2 pt-1">
				<button
					type="button"
					onclick={close}
					class="tap accent-bg flex-1 rounded-lg py-2.5 text-body font-semibold"
				>
					Save
				</button>
				<button
					type="button"
					use:hapticTap
					onclick={() => {
						haptic('warn');
						deleteTask(id).then(onClose);
					}}
					class="tap sunken danger rounded-lg px-5 py-2.5 text-body font-semibold"
				>
					Delete
				</button>
			</div>
		</div>
	{/snippet}
</Sheet>
