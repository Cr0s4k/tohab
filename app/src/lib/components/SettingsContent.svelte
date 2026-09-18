<script lang="ts">
	import AppSettings from './settings/AppSettings.svelte';
	import CalendarFeedSettings from './settings/CalendarFeedSettings.svelte';
	import DataSettings from './settings/DataSettings.svelte';
	import GeneralSettings from './settings/GeneralSettings.svelte';
	import QuickAddHelp from './settings/QuickAddHelp.svelte';
	import RecoverySettings from './settings/RecoverySettings.svelte';
	import SettingsSection from './settings/SettingsSection.svelte';
	import StorageSettings from './settings/StorageSettings.svelte';
	import SyncSettings from './settings/SyncSettings.svelte';
	import TaskNotificationSettings from './settings/TaskNotificationSettings.svelte';

	let notice = $state('');
	const onNotice = (message: string) => { notice = message; };
</script>

<div class="-my-4">
	{#if notice}
		<p role="status" class="sunken sticky top-18 z-10 mb-2 rounded-xl px-4 py-3 text-sm">{notice}</p>
	{/if}

	<SettingsSection title="Preferences" description="Appearance, week start, and sound" open>
		<GeneralSettings />
	</SettingsSection>
	<SettingsSection title="Notifications" description="Task reminders on this device">
		<TaskNotificationSettings />
	</SettingsSection>
	<SettingsSection title="Sync & account" description="Server connection and sign-in">
		<SyncSettings {onNotice} />
	</SettingsSection>
	<SettingsSection title="Calendar" description="See your tasks in another calendar">
		<CalendarFeedSettings {onNotice} />
	</SettingsSection>
	<SettingsSection title="Data & storage" description="Backups, imports, and device storage">
		<DataSettings {onNotice} />
		<StorageSettings />
	</SettingsSection>
	<SettingsSection title="Help & recovery" description="Quick add syntax and troubleshooting">
		<QuickAddHelp />
		<AppSettings />
		<RecoverySettings {onNotice} />
	</SettingsSection>
</div>
