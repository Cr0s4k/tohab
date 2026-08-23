<script lang="ts">
	import { onMount } from 'svelte';
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import { openTasksQuery } from '$lib/tasks';
	import { reconcileNotifications, setAppBadge } from '$lib/notifications';
	import { settings } from '$lib/settings.svelte';

	let openTasks = rx(() => (live.db ? openTasksQuery(live.db).$ : null), []);

	$effect(() => {
		void setAppBadge(openTasks.value.length).catch(() => undefined);
	});

	onMount(() => {
		void reconcileNotifications(settings.serverUrl, settings.reminderMinutes).catch(() => undefined);
	});
</script>
