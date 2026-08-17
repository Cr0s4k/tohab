<script lang="ts">
	import type { Project, Task } from '$lib/db/schemas';
	import { deleteTask, PRIORITY_LABELS, priorityClass, updateTask } from '$lib/tasks';
	import { humanDay, shiftKey, today } from '$lib/dates';
	import { haptic } from '$lib/haptics';
	import Sheet from './Sheet.svelte';

	let {
		task,
		projects,
		onClose
	}: { task: Task | null; projects: Project[]; onClose: () => void } = $props();

	let draft = $state({ title: '', notes: '', due: '', dueTime: '', priority: 4, projectId: '' });
	let id = $state('');

	$effect(() => {
		if (!task) return;
		id = task.id;
		draft = {
			title: task.title,
			notes: task.notes,
			due: task.due,
			dueTime: task.dueTime,
			priority: task.priority,
			projectId: task.projectId
		};
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
				class="sunken w-full rounded-2xl px-4 py-3 text-[0.95rem] outline-none"
			/>

			<textarea
				bind:value={draft.notes}
				placeholder="Notes"
				rows="3"
				class="sunken w-full resize-none rounded-2xl px-4 py-3 text-[0.9rem] outline-none placeholder:opacity-50"
			></textarea>

			<div>
				<p class="dim mb-1.5 text-[0.7rem] font-semibold tracking-wide uppercase">Due</p>
				<div class="mb-2 flex flex-wrap gap-1.5">
					{#each shortcuts() as s (s.label)}
						<button
							type="button"
							onclick={() => {
								haptic('tap');
								draft.due = s.value;
							}}
							class="tap rounded-full px-3 py-1.5 text-[0.78rem] font-medium"
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
						bind:value={draft.due}
						class="sunken min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
					/>
					<input
						type="time"
						bind:value={draft.dueTime}
						class="sunken w-28 rounded-xl px-3 py-2.5 text-sm outline-none"
					/>
				</div>
				{#if draft.due}
					<p class="dim mt-1.5 text-[0.7rem]">{humanDay(draft.due)}</p>
				{/if}
			</div>

			<div>
				<p class="dim mb-1.5 text-[0.7rem] font-semibold tracking-wide uppercase">Priority</p>
				<div class="flex gap-1.5">
					{#each [1, 2, 3, 4] as p (p)}
						<button
							type="button"
							onclick={() => {
								haptic('tap');
								draft.priority = p;
							}}
							class="tap sunken flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[0.7rem] font-medium"
							class:ring-2={draft.priority === p}
							style="--tw-ring-color: var(--accent)"
						>
							<span class="{priorityClass(p)} text-sm font-bold">P{p}</span>
							<span class="dim">{PRIORITY_LABELS[p]}</span>
						</button>
					{/each}
				</div>
			</div>

			<div>
				<p class="dim mb-1.5 text-[0.7rem] font-semibold tracking-wide uppercase">Project</p>
				<select
					bind:value={draft.projectId}
					class="sunken w-full rounded-xl px-3 py-2.5 text-sm outline-none"
				>
					<option value="">Inbox</option>
					{#each projects as p (p.id)}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			</div>

			<div class="flex gap-2 pt-1">
				<button
					type="button"
					onclick={close}
					class="tap accent-bg flex-1 rounded-2xl py-3 text-sm font-semibold"
				>
					Save
				</button>
				<button
					type="button"
					onclick={() => {
						haptic('warn');
						deleteTask(id).then(onClose);
					}}
					class="tap sunken rounded-2xl px-5 py-3 text-sm font-semibold"
					style="color: oklch(0.62 0.2 25)"
				>
					Delete
				</button>
			</div>
		</div>
	{/snippet}
</Sheet>
