<script lang="ts">
	import { parseQuickAdd } from '$lib/parse';
	import { priorityClass } from '$lib/tasks';
	import { humanDay, humanTime } from '$lib/dates';
	import { haptic } from '$lib/haptics';
	import { collapse, pop } from '$lib/motion';

	let { onSubmit, placeholder = 'Add a task…' }: { onSubmit: (raw: string) => void; placeholder?: string } =
		$props();

	let raw = $state('');
	let input: HTMLInputElement | null = $state(null);

	let parsed = $derived(raw.trim() ? parseQuickAdd(raw) : null);
	let ready = $derived(Boolean(parsed?.title));

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!ready) return;
		haptic('success');
		onSubmit(raw);
		raw = '';
		input?.focus();
	}
</script>

<form onsubmit={submit} class="raised hairline border-t px-3 pt-2.5 pb-safe">
	{#if parsed && (parsed.due || parsed.dueTime || parsed.priority !== 4 || parsed.project)}
		<div transition:collapse={{ duration: 180 }} class="mb-2 flex flex-wrap gap-1.5 px-1">
			{#if parsed.due}
				<span transition:pop class="sunken rounded-full px-2 py-0.5 text-[0.7rem] accent-fg font-medium">
					{humanDay(parsed.due)}{parsed.dueTime ? ` ${humanTime(parsed.dueTime)}` : ''}
				</span>
			{/if}
			{#if parsed.priority !== 4}
				<span transition:pop class="sunken rounded-full px-2 py-0.5 text-[0.7rem] font-medium {priorityClass(parsed.priority)}">
					P{parsed.priority}
				</span>
			{/if}
			{#if parsed.project}
				<span transition:pop class="sunken dim rounded-full px-2 py-0.5 text-[0.7rem] font-medium">#{parsed.project}</span>
			{/if}
		</div>
	{/if}

	<div class="flex items-center gap-2">
		<input
			bind:this={input}
			bind:value={raw}
			{placeholder}
			enterkeyhint="done"
			autocapitalize="sentences"
			autocomplete="off"
			class="sunken min-w-0 flex-1 rounded-2xl px-4 py-3 text-[0.95rem] outline-none placeholder:opacity-50"
		/>
		<button
			type="submit"
			disabled={!ready}
			aria-label="Add task"
			class="tap accent-bg grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-30"
		>
			<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
				<path d="M12 5v14M5 12h14" />
			</svg>
		</button>
	</div>

	{#if raw.trim() && parsed}
		<p class="dim mt-1.5 px-1 text-[0.68rem]">
			{#if parsed.matched.length}
				Understood: {parsed.matched.join(' · ')}
			{:else}
				Try “tomorrow 5pm p1 #work” or “in 3 days”
			{/if}
		</p>
	{/if}
</form>
