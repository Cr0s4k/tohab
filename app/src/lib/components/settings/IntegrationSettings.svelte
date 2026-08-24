<script lang="ts">
	import CalendarFeedSettings from './CalendarFeedSettings.svelte';
	import StorageSettings from './StorageSettings.svelte';
	import TaskNotificationSettings from './TaskNotificationSettings.svelte';

	let { onNotice }: { onNotice: (message: string) => void } = $props();
</script>

<TaskNotificationSettings />
<CalendarFeedSettings {onNotice} />
<StorageSettings />
