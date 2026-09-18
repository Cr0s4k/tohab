<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, description, open = false, children }: {
		title: string;
		description: string;
		open?: boolean;
		children: Snippet;
	} = $props();
</script>

<details {open} class="hairline border-b last:border-b-0">
	<summary class="tap flex min-h-11 cursor-pointer list-none items-center gap-4 rounded-lg py-4">
		<span class="min-w-0 flex-1">
			<span class="block text-subtitle font-semibold">{title}</span>
			<span class="dim mt-1 block text-caption">{description}</span>
		</span>
		<svg class="dim size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
	</summary>
	<div class="grid min-w-0 gap-6 pt-2 pb-6">
		{@render children()}
	</div>
</details>

<style>
	summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
	summary::-webkit-details-marker { display: none; }
	details[open] > summary svg { transform: rotate(90deg); }
</style>
