<script lang="ts">
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

	let reminderBusy = $state(false);
	let notificationsEnabled = $state(false);
	let notificationsBusy = $state(false);
	let notificationStatus = $state('');
	const notificationSupport = notificationCapability();
	const reminderChoices = [
		{ minutes: -1, label: 'Off' },
		{ minutes: 0, label: 'At time' },
		{ minutes: 10, label: '10 min' },
		{ minutes: 30, label: '30 min' },
		{ minutes: 60, label: '1 hour' }
	];

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

	async function changeReminderMinutes(minutes: number) {
		setReminderMinutes(minutes);
		reminderBusy = true;
		try {
			if (notificationsEnabled) await reconcileNotifications(settings.serverUrl, minutes);
		} catch (error) {
			notificationStatus = error instanceof Error ? error.message : 'Could not update task notifications.';
		} finally {
			reminderBusy = false;
		}
	}

	onMount(() => {
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
				<p class="dim mb-2 text-caption">Automatic reminder for timed tasks</p>
				<div class="flex flex-wrap gap-1.5">
					{#each reminderChoices as choice (choice.minutes)}
						<button type="button" aria-pressed={settings.reminderMinutes === choice.minutes} disabled={notificationsBusy || reminderBusy} onclick={() => void changeReminderMinutes(choice.minutes)} class="tap min-h-11 min-w-18 flex-1 rounded-xl px-1 text-sm font-medium disabled:opacity-50" class:accent-bg={settings.reminderMinutes === choice.minutes} class:sunken={settings.reminderMinutes !== choice.minutes}>{choice.label}</button>
					{/each}
				</div>
				<p class="dim mt-2 text-caption">Off disables automatic reminders; task-specific reminders still fire.</p>
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
