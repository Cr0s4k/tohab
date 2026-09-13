<script lang="ts">
	import Sheet from './Sheet.svelte';

	let { open = false, onClose }: { open?: boolean; onClose: () => void } = $props();

	/** Settings reaches into the database and the importers; none of that loads until opened. */
	let content = $state<Promise<typeof import('./SettingsContent.svelte')> | null>(null);

	$effect(() => {
		if (open && !content) content = import('./SettingsContent.svelte');
	});
</script>

<Sheet {open} title="Settings" confirmLabel="Done" focusTarget="dialog" {onClose}>
	{#await content then loaded}
		{#if loaded}
			<loaded.default />
		{/if}
	{/await}
</Sheet>
