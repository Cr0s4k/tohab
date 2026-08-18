<script lang="ts">
	import { runUndo, undoState } from '$lib/undo.svelte';
	import { veil } from '$lib/motion';

	let current = $derived(undoState.current);
</script>

{#if current}
	<div class="absolute bottom-20 left-4 z-40 md:bottom-6" role="status" aria-live="polite" transition:veil>
		<button
			type="button"
			onclick={runUndo}
			class="tap raised hairline flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left shadow-lg"
		>
			<span class="accent-fg grid size-7 place-items-center">
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
			</span>
			<span class="min-w-0">
				<span class="block text-sm font-semibold">Undo</span>
				<span class="dim block text-xs">{current.label}</span>
			</span>
		</button>
	</div>
{/if}
