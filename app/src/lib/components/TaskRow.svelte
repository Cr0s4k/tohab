<script lang="ts">
	import type { Task, Project } from '$lib/db/schemas';
	import { humanDay, humanTime, daysFromToday } from '$lib/dates';
	import { haptic, hapticTap } from '$lib/haptics';
	import { playComplete } from '$lib/sound';
	import { priorityClass } from '$lib/tasks';
	import { pop } from '$lib/motion';
	import { isDesktop } from '$lib/viewport';

	let {
		task,
		project,
		onToggle,
		onDelete,
		onOpen
	}: {
		task: Task;
		project?: Project;
		onToggle: () => void;
		onDelete: () => void;
		onOpen: () => void;
	} = $props();

	const THRESHOLD = 88;

	let dx = $state(0);
	let dragging = $state(false);
	let armed = $state(false);
	let swipeEl = $state<HTMLElement | null>(null);
	let start = { x: 0, y: 0 };
	let axis = $state<'none' | 'x' | 'y'>('none');

	let overdue = $derived(!task.done && !!task.due && daysFromToday(task.due) < 0);
	let hasMeta = $derived(Boolean(task.due || project || task.notes));

	function complete() {
		if (!task.done) playComplete();
		onToggle();
	}

	function down(e: PointerEvent) {
		if (isDesktop()) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		start = { x: e.clientX, y: e.clientY };
		axis = 'none';
		dragging = true;
		swipeEl?.addEventListener('touchmove', preventVerticalScroll, { passive: false });
	}

	function move(e: PointerEvent) {
		if (!dragging) return;
		const mx = e.clientX - start.x;
		const my = e.clientY - start.y;
		if (axis === 'none') {
			if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
			axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
		}
		if (axis !== 'x') return;
		dx = mx;
		const nowArmed = Math.abs(dx) > THRESHOLD;
		if (nowArmed !== armed) {
			armed = nowArmed;
			if (nowArmed) haptic('tap');
		}
	}

	function preventVerticalScroll(e: TouchEvent) {
		if (axis === 'x') e.preventDefault();
	}

	function up() {
		if (!dragging) return;
		swipeEl?.removeEventListener('touchmove', preventVerticalScroll);
		dragging = false;
		const settled = dx;
		dx = 0;
		armed = false;
		if (axis !== 'x') return;
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
		bind:this={swipeEl}
		class="surface pressable group relative px-4 pt-2.5 pb-0"
		style="transform: translateX({dx}px); transition: {dragging
			? 'none'
			: 'transform 200ms cubic-bezier(0.22,1,0.36,1), background-color 120ms ease'}; touch-action: {axis === 'x'
			? 'none'
			: 'pan-y'}"
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
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
				{#if task.due || project || task.notes}
					<div class="mt-1 flex items-center gap-2 text-caption">
						{#if task.due}
							<span class:dim={!overdue} style={overdue ? 'color: var(--danger)' : ''}>
								{humanDay(task.due)}{task.dueTime ? ` · ${humanTime(task.dueTime)}` : ''}
							</span>
						{/if}
						{#if project}
							<span class="dim flex items-center gap-1">
								<span class="size-2 rounded-full" style="background: {project.color}"></span>
								{project.name}
							</span>
						{/if}
						{#if task.notes}
							<span class="dim">📝</span>
						{/if}
					</div>
				{/if}
			</button>

			<button
				type="button"
				onclick={onOpen}
				aria-label="Edit {task.title}"
				class="edit-hint dim size-8 shrink-0 self-center place-items-center rounded-lg opacity-0 transition-opacity group-hover:opacity-100"
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
