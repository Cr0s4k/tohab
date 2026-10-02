<script lang="ts">
	import { onMount } from 'svelte';
	import { live } from '#lib/db/live.svelte.js';
	import { rx } from '#lib/rx.svelte.js';
	import { openTasksQuery } from '#lib/tasks.js';
	import { reconcileNotifications, setAppBadge } from '#lib/notifications.js';
	import { settings } from '#lib/settings.svelte.js';

	let openTasks = rx(() => (live.db ? openTasksQuery(live.db).$ : null), []);

	$effect(() => {
		void setAppBadge(openTasks.value.length).catch(() => undefined);
	});

	onMount(() => {
		void reconcileNotifications(settings.serverUrl, settings.reminderMinutes).catch(() => undefined);
	});
</script>
