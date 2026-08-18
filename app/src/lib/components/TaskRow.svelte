<script lang="ts">
	import type { Task, Project } from '$lib/db/schemas';
	import { humanDay, humanTime, daysFromToday } from '$lib/dates';
	import { haptic } from '$lib/haptics';
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
	let start = { x: 0, y: 0 };
	let axis: 'none' | 'x' | 'y' = 'none';

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

	function up() {
		if (!dragging) return;
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
	<div class="absolute inset-0 px-5 text-sm font-semibold">
		<div class="measure flex h-full items-center justify-between">
			<span
				class="flex items-center gap-2"
				style="color: oklch(0.62 0.15 150); opacity: {Math.min(1, Math.max(0, dx / THRESHOLD))}"
			>
				✓ {task.done ? 'Reopen' : 'Complete'}
			</span>
			<span
				class="flex items-center gap-2"
				style="color: oklch(0.62 0.2 25); opacity: {Math.min(1, Math.max(0, -dx / THRESHOLD))}"
			>
				Delete
			</span>
		</div>
	</div>

	<div
		role="group"
		class="surface hairline relative border-b px-4 py-3 hover:sunken active:sunken"
		style="transform: translateX({dx}px); transition: {dragging
			? 'none'
			: 'transform 200ms cubic-bezier(0.22,1,0.36,1), background-color 120ms ease'}; touch-action: pan-y"
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
	>
		<div class="measure flex gap-3" class:items-start={hasMeta} class:items-center={!hasMeta}>
			<button
				type="button"
				aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
				onclick={() => {
					haptic('success');
					complete();
				}}
				class="tap grid size-6 shrink-0 place-items-center rounded-full border-2 {hasMeta
					? 'mt-0.5'
					: ''} {priorityClass(task.priority)}"
				style="border-color: currentColor; background: {task.done
					? 'currentColor'
					: 'transparent'}; transition: background 160ms ease"
			>
				{#if task.done}
					<svg transition:pop={{ duration: 200 }} viewBox="0 0 24 24" class="size-4" fill="none" stroke="var(--surface-raised)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
						<path d="M4 12.5l5 5L20 6.5" />
					</svg>
				{/if}
			</button>

			<button type="button" onclick={onOpen} class="min-w-0 flex-1 text-left">
				<div class="truncate text-[0.95rem] leading-snug" class:line-through={task.done} class:dim={task.done}>
					{task.title}
				</div>
				{#if task.due || project || task.notes}
					<div class="mt-1 flex items-center gap-2 text-xs">
						{#if task.due}
							<span class:dim={!overdue} style={overdue ? 'color: oklch(0.62 0.2 25)' : ''}>
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
		</div>
	</div>
</div>
