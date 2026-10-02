<script lang="ts">
	import { haptic, hapticTap } from '#lib/haptics.js';
	import { settingsSheet } from '#lib/settingsSheet.svelte.js';
</script>

<button
	type="button"
	use:hapticTap
	aria-label="Settings"
	onclick={() => {
		haptic('tap');
		settingsSheet.open = true;
	}}
	class="tap sunken hairline grid size-9 place-items-center rounded-full border md:size-8 md:hidden"
>
	<svg
		viewBox="0 0 24 24"
		class="size-[1.05rem] md:size-4"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path
			d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2v.2a2 2 0 01-4 0v-.1a1.7 1.7 0 00-2.9-1.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1A1.7 1.7 0 003.6 14H3.4a2 2 0 010-4h.2a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 012.8-2.8l.1.1A1.7 1.7 0 0010 3.6V3.4a2 2 0 014 0v.2a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 012.8 2.8l-.1.1A1.7 1.7 0 0021 10h.2a2 2 0 010 4H21a1.7 1.7 0 00-1.6 1z"
		/>
	</svg>
</button>
