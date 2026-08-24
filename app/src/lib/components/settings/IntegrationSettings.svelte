<script lang="ts">
	import { feedUrl, setCalendarAlarmMinutes } from '$lib/calendar';
	import { haptic, hapticTap } from '$lib/haptics';
	import {
		currentPushSubscription,
		disableNotifications,
		enableNotifications,
		notificationCapability,
		reconcileNotifications,
		sendTestNotification
	} from '$lib/notifications';
	import { setReminderMinutes, settings } from '$lib/settings.svelte';
	import { onMount } from 'svelte';

	let { onNotice }: { onNotice: (message: string) => void } = $props();
	let feed = $state('');
	let feedError = $state('');
	let feedBusy = $state(false);
	let reminderBusy = $state(false);
	let storageStatus = $state('Checking storage…');
	let storagePersistent = $state(false);
	let notificationsEnabled = $state(false);
	let notificationsBusy = $state(false);
	let notificationStatus = $state('');
	const notificationSupport = notificationCapability();
	const reminderChoices = [
		{ minutes: 0, label: 'Off' },
		{ minutes: 10, label: '10 min' },
		{ minutes: 30, label: '30 min' },
		{ minutes: 60, label: '1 hour' }
	];

	async function refreshStorage() {
		if (!navigator.storage) {
			storageStatus = 'Storage details are unavailable in this browser.';
			return;
		}
		const [persistent, estimate] = await Promise.all([
			navigator.storage.persisted?.() ?? false,
			navigator.storage.estimate()
		]);
		storagePersistent = persistent;
		const used = estimate.usage == null ? 'unknown' : `${(estimate.usage / 1_048_576).toFixed(1)} MB`;
		const quota = estimate.quota == null ? 'unknown' : `${(estimate.quota / 1_048_576).toFixed(0)} MB`;
		storageStatus = `${used} used of ${quota}; ${persistent ? 'protected from automatic eviction' : 'browser may evict when space is low'}.`;
	}

	async function requestPersistentStorage() {
		if (!navigator.storage?.persist) {
			storageStatus = 'Persistent storage is not supported here.';
			return;
		}
		storagePersistent = await navigator.storage.persist();
		await refreshStorage();
	}

	async function refreshNotifications() {
		notificationsEnabled = Boolean(await currentPushSubscription().catch(() => null));
		if (notificationsEnabled) {
			void reconcileNotifications(settings.serverUrl, settings.reminderMinutes).catch(() => undefined);
		}
	}

	async function enableTaskNotifications() {
		notificationsBusy = true;
		notificationStatus = '';
		try {
			await enableNotifications(settings.serverUrl, settings.reminderMinutes);
			notificationsEnabled = true;
			notificationStatus = 'Task reminders are enabled on this device.';
			haptic('success');
		} catch (error) {
			notificationStatus = error instanceof Error ? error.message : 'Could not enable notifications.';
			haptic('warn');
		} finally {
			notificationsBusy = false;
		}
	}

	async function disableTaskNotifications() {
		notificationsBusy = true;
		try {
			await disableNotifications(settings.serverUrl);
			notificationsEnabled = false;
			notificationStatus = 'Task reminders are disabled on this device.';
		} catch (error) {
			notificationStatus = error instanceof Error ? error.message : 'Could not disable notifications.';
		} finally {
			notificationsBusy = false;
		}
	}

	async function testTaskNotifications() {
		notificationsBusy = true;
		try {
			await sendTestNotification(settings.serverUrl);
			notificationStatus = 'The push service accepted the test. If it does not appear, check system notification settings and Focus or Do Not Disturb.';
		} catch (error) {
			notificationStatus = error instanceof Error ? error.message : 'Could not send a test notification.';
		} finally {
			notificationsBusy = false;
		}
	}

	async function revealFeed() {
		feedBusy = true;
		feedError = '';
		try {
			feed = await feedUrl(settings.reminderMinutes);
		} catch (error) {
			feed = '';
			feedError = error instanceof Error ? error.message : 'Could not reach the server.';
		} finally {
			feedBusy = false;
		}
	}

	async function changeReminderMinutes(minutes: number) {
		setReminderMinutes(minutes);
		reminderBusy = true;
		feedError = '';
		try {
			await Promise.all([
				setCalendarAlarmMinutes(minutes).catch((error) => {
					feedError = error instanceof Error ? error.message : 'Could not update the calendar feed.';
				}),
				notificationsEnabled
					? reconcileNotifications(settings.serverUrl, minutes).catch((error) => {
						notificationStatus = error instanceof Error ? error.message : 'Could not update task notifications.';
					})
					: Promise.resolve()
			]);
		} finally {
			reminderBusy = false;
		}
	}

	async function copyFeed() {
		try {
			await navigator.clipboard.writeText(feed);
			haptic('success');
			onNotice('Feed URL copied. Add it in Google Calendar under “From URL”.');
		} catch {
			onNotice('Copy failed — select the URL and copy it manually.');
		}
	}

	onMount(() => {
		void refreshStorage();
		void refreshNotifications();
	});
</script>

<section class="mb-6">
	<h2 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">Task notifications</h2>
	<div class="raised hairline rounded-2xl border">
		{#if !notificationSupport.supported}
			<p class="px-4 py-3 text-sm">{notificationSupport.reason}</p>
		{:else}
			<div class="hairline border-b px-4 py-3">
				<p class="dim mb-2 text-caption">Remind me before a timed task</p>
				<div class="flex gap-1.5">
					{#each reminderChoices as choice (choice.minutes)}
						<button type="button" aria-pressed={settings.reminderMinutes === choice.minutes} disabled={notificationsBusy || reminderBusy} onclick={() => void changeReminderMinutes(choice.minutes)} class="tap min-h-11 flex-1 rounded-xl px-1 text-sm font-medium disabled:opacity-50" class:accent-bg={settings.reminderMinutes === choice.minutes} class:sunken={settings.reminderMinutes !== choice.minutes}>{choice.label}</button>
					{/each}
				</div>
			</div>
			<div class="flex gap-2 p-3">
				<button type="button" use:hapticTap disabled={notificationsBusy} onclick={notificationsEnabled ? disableTaskNotifications : enableTaskNotifications} class="tap accent-bg min-h-11 flex-1 rounded-xl px-3 text-sm font-semibold disabled:opacity-50">{notificationsEnabled ? 'Disable notifications' : 'Enable notifications'}</button>
				{#if notificationsEnabled}
					<button type="button" disabled={notificationsBusy} onclick={testTaskNotifications} class="tap sunken min-h-11 rounded-xl px-4 text-sm font-semibold disabled:opacity-50">Send test</button>
				{/if}
			</div>
		{/if}
	</div>
	{#if notificationStatus}<p class="dim mt-2 text-caption" role="status">{notificationStatus}</p>{/if}
	<p class="dim mt-2 text-caption">Permission is requested only when you tap Enable. On iPhone and iPad, notifications require the installed Home Screen app.</p>
</section>

<section class="mb-6">
	<h2 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">Calendar feed</h2>
	<div class="raised hairline rounded-2xl border">
		<div class="hairline border-b px-4 py-3">
			<p class="dim mb-1.5 text-caption">Remind me before a timed task</p>
			<div class="flex gap-1.5">
				{#each reminderChoices as choice (choice.minutes)}
					<button type="button" aria-pressed={settings.reminderMinutes === choice.minutes} disabled={feedBusy || reminderBusy} use:hapticTap onclick={() => void changeReminderMinutes(choice.minutes)} class="tap flex-1 rounded-xl py-2 text-[0.75rem] font-medium disabled:opacity-50" class:accent-bg={settings.reminderMinutes === choice.minutes} class:sunken={settings.reminderMinutes !== choice.minutes}>{choice.label}</button>
				{/each}
			</div>
		</div>
		{#if feed}
			<div class="hairline border-b px-4 py-3">
				<p class="sunken rounded-xl px-3 py-2 font-mono text-caption break-all select-all">{feed}</p>
				<button type="button" use:hapticTap onclick={copyFeed} class="tap accent-bg mt-2 w-full rounded-xl py-2 text-[0.8rem] font-semibold">Copy URL</button>
			</div>
		{:else}
			<button type="button" onclick={revealFeed} disabled={feedBusy} class="tap hairline w-full border-b px-4 py-3 text-left text-sm disabled:opacity-50">{feedBusy ? 'Asking the server…' : 'Show subscription URL'}</button>
		{/if}
		<div class="px-4 py-3 text-caption">
			{#if feedError}
				<p class="danger">{feedError}</p>
			{:else}
				<p class="dim">Subscribe to this URL in Google Calendar (Other calendars → From URL) or iOS Calendar. Open tasks with a due date appear as events; timed ones carry the reminder above. This URL stays the same; reminder and task changes appear when the calendar refreshes.</p>
			{/if}
		</div>
	</div>
	<p class="dim mt-2 text-caption">Anyone with this URL can read your tasks, so treat it as a password. It works only while the sync server is reachable from the internet.</p>
</section>

<section class="mb-6">
	<h2 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">Storage</h2>
	<div class="raised hairline rounded-2xl border p-4">
		<p class="text-sm">{storageStatus}</p>
		{#if !storagePersistent}
			<button type="button" class="tap accent-fg mt-2 min-h-11 text-sm font-semibold" onclick={requestPersistentStorage}>Request persistent storage</button>
		{/if}
	</div>
</section>
