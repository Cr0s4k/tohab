<script lang="ts">
	import type { Task, Project } from '$lib/db/schemas';
	import { humanDay, humanTime, daysFromToday } from '$lib/dates';
	import { haptic, hapticTap } from '$lib/haptics';
	import { playComplete } from '$lib/sound';
	import { priorityClass } from '$lib/tasks';
	import { describeRepeat, isRepeating } from '$lib/repeat';
	import { scrollTap } from '$lib/scrollTap';
	import { isDesktop } from '$lib/viewport';
	import type { SubtaskProgress } from '$lib/taskViews';

	let {
		task,
		project,
		subtaskProgress,
		onToggle,
		onDelete,
		onOpen
	}: {
		task: Task & { depth?: number };
		project?: Project;
		subtaskProgress?: SubtaskProgress;
		onToggle: () => void;
		onDelete: () => void;
		onOpen: () => void;
	} = $props();

	const THRESHOLD = 112;

	let dx = $state(0);
	let dragging = $state(false);
	let armed = $state(false);
	let pointerId: number | undefined;
	let start = { x: 0, y: 0 };
	let axis = $state<'none' | 'x' | 'y'>('none');

	let overdue = $derived(!task.done && !!task.due && daysFromToday(task.due) < 0);
	let repeats = $derived(isRepeating(task.repeat));
	let hasDetails = $derived(Boolean(subtaskProgress || task.due || project || repeats));
	let hasMeta = $derived(Boolean(task.notes || hasDetails));

	function complete() {
		if (!task.done) playComplete();
		onToggle();
	}

	function down(e: PointerEvent) {
		if (isDesktop()) return;
		if (dragging) { cancel(); return; }
		if (!e.isPrimary && e.isTrusted) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		pointerId = e.pointerId;
		start = { x: e.clientX, y: e.clientY };
		axis = 'none';
		dragging = true;
	}

	function move(e: PointerEvent) {
		if (!dragging || e.pointerId !== pointerId) return;
		const mx = e.clientX - start.x;
		const my = e.clientY - start.y;
		if (axis === 'none') {
			// Give scrolling priority; diagonal intent never becomes a swipe later.
			if (Math.abs(my) >= 10 && Math.abs(mx) < Math.abs(my) * 2) axis = 'y';
			else if (Math.abs(mx) >= 24 && Math.abs(mx) >= Math.abs(my) * 2) axis = 'x';
			else return;
		}
		if (axis !== 'x') return;
		dx = mx;
		const nowArmed = Math.abs(dx) > THRESHOLD;
		if (nowArmed !== armed) {
			armed = nowArmed;
			if (nowArmed) haptic('tap');
		}
	}

	function cancel() {
		pointerId = undefined;
		dragging = false;
		dx = 0;
		armed = false;
		axis = 'none';
	}

	function up(e: PointerEvent) {
		if (!dragging || e.pointerId !== pointerId) return;
		move(e);
		const settled = dx;
		const horizontal = axis === 'x';
		cancel();
		if (!horizontal) return;
		if (settled > THRESHOLD) {
			haptic('success');
			complete();
		} else if (settled < -THRESHOLD) {
			haptic('warn');
			onDelete();
		}
	}
</script>

<div class="relative overflow-hidden">
	<div class="absolute inset-0 px-5 text-copy font-semibold">
		<div class="measure flex h-full items-center justify-between">
			<span
				class="flex items-center gap-2"
				style="color: var(--positive); opacity: {Math.min(1, Math.max(0, dx / THRESHOLD))}"
			>
				✓ {task.done ? 'Reopen' : 'Complete'}
			</span>
			<span
				class="flex items-center gap-2"
				style="color: var(--danger); opacity: {Math.min(1, Math.max(0, -dx / THRESHOLD))}"
			>
				Delete
			</span>
		</div>
	</div>

	<div
		role="group"
		use:scrollTap
		class="surface pressable group relative pr-4 pt-2.5 pb-0"
		style:padding-left="1rem"
		style="transform: translateX({dx}px); transition: {dragging
			? 'none'
			: 'transform 200ms cubic-bezier(0.22,1,0.36,1), background-color 120ms ease'}; touch-action: pan-y pinch-zoom"
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={cancel}
	>
		<div
			class="hairline measure flex gap-3 border-b pb-2.5"
			class:items-start={hasMeta}
			class:items-center={!hasMeta}
		>
			<button
				type="button"
				role="checkbox"
				aria-checked={task.done}
				use:hapticTap
				aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
				onclick={() => {
					haptic('success');
					complete();
				}}
				class="task-check tap relative grid size-5 shrink-0 place-items-center rounded-full border-2 before:absolute before:-inset-2.5 before:content-[''] {hasMeta
					? 'mt-0.5'
					: ''} {priorityClass(task.priority)}"
				style="border-color: currentColor"
			>
				<svg viewBox="0 0 24 24" class="task-check__tick size-3" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
					<path d="M4 12.5l5 5L20 6.5" />
				</svg>
			</button>

			<button type="button" onclick={onOpen} class="min-w-0 flex-1 text-left">
				<div class="truncate text-body leading-snug" class:line-through={task.done} class:dim={task.done}>
					{task.title}
				</div>
				{#if task.notes}
					<div class="dim mt-1 truncate text-caption">
						{task.notes}
					</div>
				{/if}
				{#if hasDetails}
						<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
						{#if subtaskProgress}
							<span
								class="dim flex items-center gap-1 whitespace-nowrap"
								aria-label={`${subtaskProgress.completed} of ${subtaskProgress.total} subtasks complete`}
								title={`${subtaskProgress.completed} of ${subtaskProgress.total} subtasks complete`}
							>
								<svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M6 3v12a3 3 0 0 0 3 3h9" />
									<path d="m15 15 3 3-3 3" />
									<path d="M6 9h9" />
									<path d="m12 6 3 3-3 3" />
								</svg>
								{subtaskProgress.completed}/{subtaskProgress.total}
							</span>
						{/if}
						{#if task.due}
								<span class="shrink-0 whitespace-nowrap" class:dim={!overdue} style={overdue ? 'color: var(--danger)' : ''}>
								{humanDay(task.due)}{task.dueTime ? ` · ${humanTime(task.dueTime)}` : ''}
							</span>
						{/if}
						{#if project}
								<span class="dim flex min-w-0 max-w-full items-center gap-1" title={project.name}>
									<span class="size-2 shrink-0 rounded-full" style="background: {project.color}"></span>
									<span class="truncate">{project.name}</span>
							</span>
						{/if}
						{#if repeats}
							<span class="dim" title={describeRepeat(task.repeat!)}>↻</span>
						{/if}
					</div>
				{/if}
			</button>

			<button
				type="button"
				onclick={onOpen}
				aria-label="Edit {task.title}"
					class="edit-hint dim size-8 shrink-0 self-center place-items-center rounded-lg opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
			>
				<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 20h9" />
					<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
				</svg>
			</button>
		</div>
	</div>
</div>

<style>
	.task-check {
		background: transparent;
		transition: background-color 160ms ease;
	}

	.task-check::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 9999px;
		background: currentColor;
		opacity: 0.08;
		transition: opacity 160ms ease;
	}

	.task-check[aria-checked='true'] {
		background: currentColor;
	}

	.task-check[aria-checked='true']::before {
		opacity: 0;
	}

	.task-check__tick {
		opacity: 0;
		transition: opacity 160ms ease;
	}

	.task-check:hover .task-check__tick,
	.task-check[aria-checked='true'] .task-check__tick {
		opacity: 1;
	}

	.task-check[aria-checked='true'] .task-check__tick {
		stroke: var(--surface);
	}
</style>
