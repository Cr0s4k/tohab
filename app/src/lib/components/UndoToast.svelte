<script lang="ts">
	import { runUndo, undoState } from '#lib/undo.svelte.js';
	import { veil } from '#lib/motion.js';

	let {
		placement = 'float',
		collapsed = false
	}: { placement?: 'float' | 'sidebar'; collapsed?: boolean } = $props();

	let current = $derived(undoState.current);
</script>

{#snippet icon()}
	<svg
		viewBox="0 0 24 24"
		class="size-5"
		fill="none"
		stroke="currentColor"
		stroke-width="2.2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M9 14L4 9l5-5" />
		<path d="M4 9h10a6 6 0 016 6v3" />
	</svg>
{/snippet}

{#if current}
	{#if placement === 'sidebar'}
		<div class="px-2.5 pb-2.5" role="status" aria-live="polite" transition:veil>
			<button
				type="button"
				onclick={runUndo}
				title={collapsed ? `Undo ${current.label}` : undefined}
				class="undo-inline tap hairline flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left"
				class:justify-center={collapsed}
			>
				<span class="accent-fg grid size-5 shrink-0 place-items-center">
					{@render icon()}
				</span>
				{#if !collapsed}
					<span class="min-w-0 flex-1">
						<span class="block text-sm font-semibold">Undo</span>
						<span class="dim block truncate text-xs">{current.label}</span>
					</span>
				{/if}
			</button>
		</div>
	{:else}
		<div
			class="undo-float absolute bottom-full z-40 mb-4 md:hidden"
			role="status"
			aria-live="polite"
			transition:veil
		>
			<button
				type="button"
				onclick={runUndo}
				class="tap raised hairline flex max-w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left shadow-lg"
			>
				<span class="accent-fg grid size-7 shrink-0 place-items-center">
					{@render icon()}
				</span>
				<span class="min-w-0">
					<span class="block text-sm font-semibold">Undo</span>
					<span class="dim block text-xs break-words">{current.label}</span>
				</span>
			</button>
		</div>
	{/if}
{/if}

<style>
	.undo-float {
		left: max(1rem, env(safe-area-inset-left, 0px));
		right: max(1rem, env(safe-area-inset-right, 0px));
	}

	.undo-inline {
		background: var(--surface-sunken);
	}
</style>
