<script lang="ts">
	import { sync, resync } from '$lib/db/replication.svelte';
	import { haptic } from '$lib/haptics';

	const meta = {
		off: { label: 'Local only', color: 'var(--text-dim)' },
		offline: { label: 'Offline', color: 'oklch(0.7 0.14 60)' },
		syncing: { label: 'Syncing', color: 'oklch(0.65 0.14 250)' },
		synced: { label: 'Synced', color: 'oklch(0.65 0.15 150)' },
		error: { label: 'Sync error', color: 'oklch(0.62 0.2 25)' },
		unauthorized: { label: 'Signed out', color: 'oklch(0.62 0.2 25)' }
	};

	let current = $derived(meta[sync.phase]);
</script>

<button
	type="button"
	onclick={() => {
		haptic('tap');
		resync();
	}}
	title={sync.message || current.label}
	class="tap grid size-9 place-items-center md:size-6"
>
	<span
		class="size-2.5 rounded-full"
		class:animate-pulse={sync.phase === 'syncing'}
		style="background: {current.color}"
	></span>
</button>
