<script lang="ts">
	import Sheet from './Sheet.svelte';
	import SettingsContent from './SettingsContent.svelte';

	let { open = false, onClose }: { open?: boolean; onClose: () => void } = $props();
</script>

<Sheet {open} title="Settings" confirmLabel="Done" {onClose}>
	<SettingsContent />
</Sheet>
