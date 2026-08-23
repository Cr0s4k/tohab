<script lang="ts">
	import type { Project, Task } from '$lib/db/schemas';
	import {
		createTask,
		deleteTask,
		directSubtasksQuery,
		PRIORITY_LABELS,
		priorityClass,
		toggleTask,
		updateTask
	} from '$lib/tasks';
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import { humanDay, shiftKey, today } from '$lib/dates';
	import { describeRepeat, REPEAT_PRESETS } from '$lib/repeat';
	import { haptic, hapticTap } from '$lib/haptics';
	import Sheet from './Sheet.svelte';

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

	const shortcuts = () => [
		{ label: 'Today', value: today() },
		{ label: 'Tomorrow', value: shiftKey(today(), 1) },
		{ label: 'Next week', value: shiftKey(today(), 7) },
		{ label: 'None', value: '' }
	];
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
				<div class="mb-2 flex flex-wrap gap-1.5">
					{#each shortcuts() as s (s.label)}
						<button
							type="button"
							use:hapticTap
							onclick={() => {
								haptic('tap');
								draft.due = s.value;
							}}
							class="tap min-h-11 rounded-full px-3 py-1.5 text-caption font-medium"
							aria-pressed={draft.due === s.value}
							class:accent-bg={draft.due === s.value}
							class:sunken={draft.due !== s.value}
						>
							{s.label}
						</button>
					{/each}
				</div>
				<div class="flex gap-2">
					<input
						type="date"
						aria-label="Due date"
						bind:value={draft.due}
						class="sunken min-w-0 flex-1 rounded-xl px-3 py-2.5 text-copy outline-none"
					/>
					<input
						type="time"
						aria-label="Due time"
						bind:value={draft.dueTime}
						class="sunken w-28 rounded-xl px-3 py-2.5 text-copy outline-none"
					/>
				</div>
				{#if draft.due}
					<p class="dim mt-1.5 text-caption">{humanDay(draft.due)}</p>
				{/if}
			</div>

			<div>
				<p class="dim mb-1.5 text-caption font-semibold tracking-wide uppercase">Repeat</p>
				<div class="flex flex-wrap gap-1.5">
					{#each REPEAT_PRESETS as r (r.label)}
						<button
							type="button"
							use:hapticTap
							onclick={() => {
								haptic('tap');
								draft.repeat = r.value;
							}}
							class="tap min-h-11 rounded-full px-3 py-1.5 text-caption font-medium"
							aria-pressed={draft.repeat === r.value}
							class:accent-bg={draft.repeat === r.value}
							class:sunken={draft.repeat !== r.value}
						>
							{r.label}
						</button>
					{/each}
				</div>
				{#if draft.repeat}
					<p class="dim mt-1.5 text-caption">
						{describeRepeat(draft.repeat)} · completing it moves the due date on
					</p>
				{/if}
			</div>

			<div>
				<p class="dim mb-1.5 text-caption font-semibold tracking-wide uppercase">Priority</p>
				<div class="flex gap-1.5">
					{#each [1, 2, 3, 4] as p (p)}
						<button
							type="button"
							use:hapticTap
							onclick={() => {
								haptic('tap');
								draft.priority = p;
							}}
							class="tap sunken flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-caption font-medium"
							aria-pressed={draft.priority === p}
							class:ring-2={draft.priority === p}
							style="--tw-ring-color: var(--accent)"
						>
							<span class="{priorityClass(p)} text-body font-bold">P{p}</span>
							<span class="dim">{PRIORITY_LABELS[p]}</span>
						</button>
					{/each}
				</div>
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
