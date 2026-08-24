<script lang="ts">
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import { habitsQuery } from '$lib/habits';
	import { openTasksQuery } from '$lib/tasks';
	import { downloadBackup, importBackup } from '$lib/backup';
	import { importTodoistCsv } from '$lib/todoist';
	import { resync, restartSync, stopSync, sync } from '$lib/db/replication.svelte';
	import { removeDb } from '$lib/db/lazy';
	import {
		setReminderMinutes,
		setServerUrl,
		setSound,
		setStartOfWeek,
		setSyncEnabled,
		setTheme,
		settings,
		type Theme
	} from '$lib/settings.svelte';
	import { feedUrl } from '$lib/calendar';
	import {
		currentPushSubscription,
		disableNotifications,
		enableNotifications,
		notificationCapability,
		reconcileNotifications,
		sendTestNotification
	} from '$lib/notifications';
	import { auth, logout } from '$lib/auth.svelte';
	import { haptic, hapticTap } from '$lib/haptics';
	import { onMount } from 'svelte';

	let serverDraft = $state(settings.serverUrl);
	let notice = $state('');
	let fileInput: HTMLInputElement | null = $state(null);
	let todoistInput: HTMLInputElement | null = $state(null);
	let feed = $state('');
	let feedError = $state('');
	let feedBusy = $state(false);
	let storageStatus = $state('Checking storage…');
	let storagePersistent = $state(false);
	let notificationsEnabled = $state(false);
	let notificationsBusy = $state(false);
	let notificationStatus = $state('');
	const notificationSupport = notificationCapability();

	async function refreshStorage() {
		if (!navigator.storage) { storageStatus = 'Storage details are unavailable in this browser.'; return; }
		const [persistent, estimate] = await Promise.all([navigator.storage.persisted?.() ?? false, navigator.storage.estimate()]);
		storagePersistent = persistent;
		const used = estimate.usage == null ? 'unknown' : `${(estimate.usage / 1_048_576).toFixed(1)} MB`;
		const quota = estimate.quota == null ? 'unknown' : `${(estimate.quota / 1_048_576).toFixed(0)} MB`;
		storageStatus = `${used} used of ${quota}; ${persistent ? 'protected from automatic eviction' : 'browser may evict when space is low'}.`;
	}

	async function requestPersistentStorage() {
		if (!navigator.storage?.persist) { storageStatus = 'Persistent storage is not supported here.'; return; }
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
			notificationStatus = 'Test notification sent. If it does not appear, check system notification settings and Focus or Do Not Disturb.';
		} catch (error) {
			notificationStatus = error instanceof Error ? error.message : 'Could not send a test notification.';
		} finally {
			notificationsBusy = false;
		}
	}

	onMount(() => {
		void refreshStorage();
		void refreshNotifications();
	});

	async function revealFeed() {
		feedBusy = true;
		feedError = '';
		try {
			feed = await feedUrl(settings.reminderMinutes);
		} catch (err) {
			feed = '';
			feedError = err instanceof Error ? err.message : 'Could not reach the server.';
		}
		feedBusy = false;
	}

	async function copyFeed() {
		try {
			await navigator.clipboard.writeText(feed);
			haptic('success');
			notice = 'Feed URL copied. Add it in Google Calendar under “From URL”.';
		} catch {
			notice = 'Copy failed — select the URL and copy it manually.';
		}
	}

	const reminderChoices = [
		{ minutes: 0, label: 'Off' },
		{ minutes: 10, label: '10 min' },
		{ minutes: 30, label: '30 min' },
		{ minutes: 60, label: '1 hour' }
	];

	let habits = rx(() => (live.db ? habitsQuery(live.db, true).$ : null), []);
	let openTasks = rx(() => (live.db ? openTasksQuery(live.db).$ : null), []);

	async function onFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const result = await importBackup(await file.text());
			notice = `Imported ${result.imported} records${result.skipped ? `, skipped ${result.skipped}` : ''}.`;
			haptic('success');
		} catch (err) {
			notice = err instanceof Error ? err.message : 'Import failed.';
			haptic('warn');
		}
		if (fileInput) fileInput.value = '';
	}

	async function onTodoistFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const result = await importTodoistCsv(await file.text());
			notice = `Imported ${result.imported} Todoist tasks${result.skipped ? `, skipped ${result.skipped}` : ''}.`;
			haptic('success');
		} catch (err) {
			notice = err instanceof Error ? err.message : 'Todoist import failed.';
			haptic('warn');
		}
		if (todoistInput) todoistInput.value = '';
	}

	async function applyServer() {
		await stopSync();
		setServerUrl(serverDraft.trim() || '/sync');
		// Reload through the ownership guard before this database can sync to another server.
		location.reload();
	}

	let confirmReset = $state(false);

	async function resetLocalData() {
		if (!confirmReset) {
			confirmReset = true;
			notice = 'Tap again to confirm — this clears this device’s local copy.';
			return;
		}
		confirmReset = false;
		await stopSync();
		await removeDb();
		location.reload();
	}

	const themes: { id: Theme; label: string }[] = [
		{ id: 'system', label: 'System' },
		{ id: 'light', label: 'Light' },
		{ id: 'dark', label: 'Dark' }
	];
</script>

{#if notice}
	<p class="sunken mb-4 rounded-xl px-3 py-2 text-[0.8rem]">{notice}</p>
{/if}

<section class="mb-6">
	<h2 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">Appearance</h2>
	<div class="flex gap-1.5">
		{#each themes as t (t.id)}
			<button
				type="button"
				use:hapticTap
				onclick={() => {
					haptic('tap');
					setTheme(t.id);
				}}
				aria-pressed={settings.theme === t.id}
				class="tap min-h-11 flex-1 rounded-xl py-2.5 text-sm font-medium"
				class:accent-bg={settings.theme === t.id}
				class:sunken={settings.theme !== t.id}
			>
				{t.label}
			</button>
		{/each}
	</div>

	<h2 class="dim mt-4 mb-2 text-caption font-semibold tracking-wide uppercase">Week starts on</h2>
	<div class="flex gap-1.5">
		{#each [{ id: 1, label: 'Monday' }, { id: 0, label: 'Sunday' }] as opt (opt.id)}
			<button
				type="button"
				onclick={() => setStartOfWeek(opt.id as 0 | 1)}
				aria-pressed={settings.startOfWeek === opt.id}
				class="tap min-h-11 flex-1 rounded-xl py-2.5 text-sm font-medium"
				class:accent-bg={settings.startOfWeek === opt.id}
				class:sunken={settings.startOfWeek !== opt.id}
			>
				{opt.label}
			</button>
		{/each}
	</div>

	<div class="raised hairline mt-4 rounded-2xl border">
		<label class="flex items-center justify-between gap-3 px-4 py-3">
			<span class="text-sm">Sound on complete</span>
			<input
				type="checkbox"
				checked={settings.sound}
				onchange={(e) => setSound(e.currentTarget.checked)}
				class="size-5 accent-current"
			/>
		</label>
	</div>
</section>

<section class="mb-6">
	<h2 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">Sync</h2>
	<div class="raised hairline rounded-2xl border">
		<label class="hairline flex items-center justify-between gap-3 border-b px-4 py-3">
			<span class="text-sm">Sync with server</span>
			<input
				type="checkbox"
				checked={settings.syncEnabled}
				onchange={(e) => {
					setSyncEnabled(e.currentTarget.checked);
					restartSync();
				}}
				class="size-5 accent-current"
			/>
		</label>
		<div class="hairline border-b px-4 py-3">
			<p class="dim mb-1.5 text-caption">Server URL</p>
			<div class="flex gap-2">
				<input
					bind:value={serverDraft}
					placeholder="/sync"
					class="sunken min-w-0 flex-1 rounded-xl px-3 py-2 text-sm outline-none"
				/>
				<button
					type="button"
					onclick={applyServer}
					class="tap accent-bg rounded-xl px-4 text-sm font-semibold"
				>
					Apply
				</button>
			</div>
		</div>
		<button
			type="button"
			use:hapticTap
			onclick={() => {
				haptic('tap');
				resync();
				notice = 'Requested a fresh pull from the server.';
			}}
			class="tap hairline w-full border-b px-4 py-3 text-left text-sm"
		>
			Force resync
		</button>
		<div class="px-4 py-3 text-caption">
			<p class="dim">
				Status: {sync.phase}{sync.message ? ` — ${sync.message}` : ''}
			</p>
			<p class="dim mt-1 break-all">Account: {auth.session?.email ?? 'signed out'}</p>
		</div>
	</div>
</section>

<section class="mb-6">
	<h2 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">Account</h2>
	<div class="raised hairline rounded-2xl border">
		<button
			type="button"
			use:hapticTap
			onclick={async () => {
				haptic('tap');
				await disableNotifications(settings.serverUrl).catch(() => undefined);
				await stopSync();
				await logout();
			}}
			class="tap w-full px-4 py-3 text-left text-sm"
		>
			Sign out
		</button>
	</div>
	<p class="dim mt-2 text-caption">
		Signing out keeps this account’s isolated offline database on this device. Another account
		or sync server receives a separate local database.
	</p>
</section>

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
						<button
							type="button"
							aria-pressed={settings.reminderMinutes === choice.minutes}
							disabled={notificationsBusy}
							onclick={() => {
								setReminderMinutes(choice.minutes);
								if (notificationsEnabled) void reconcileNotifications(settings.serverUrl, choice.minutes);
							}}
							class="tap min-h-11 flex-1 rounded-xl px-1 text-sm font-medium disabled:opacity-50"
							class:accent-bg={settings.reminderMinutes === choice.minutes}
							class:sunken={settings.reminderMinutes !== choice.minutes}
						>
							{choice.label}
						</button>
					{/each}
				</div>
			</div>
			<div class="flex gap-2 p-3">
				<button
					type="button"
					use:hapticTap
					disabled={notificationsBusy}
					onclick={notificationsEnabled ? disableTaskNotifications : enableTaskNotifications}
					class="tap accent-bg min-h-11 flex-1 rounded-xl px-3 text-sm font-semibold disabled:opacity-50"
				>
					{notificationsEnabled ? 'Disable notifications' : 'Enable notifications'}
				</button>
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
					<button
						type="button"
						aria-pressed={settings.reminderMinutes === choice.minutes}
						use:hapticTap
						onclick={() => {
							haptic('tap');
							setReminderMinutes(choice.minutes);
							if (feed) revealFeed();
						}}
						class="tap flex-1 rounded-xl py-2 text-[0.75rem] font-medium"
						class:accent-bg={settings.reminderMinutes === choice.minutes}
						class:sunken={settings.reminderMinutes !== choice.minutes}
					>
						{choice.label}
					</button>
				{/each}
			</div>
		</div>

		{#if feed}
			<div class="hairline border-b px-4 py-3">
				<p class="sunken rounded-xl px-3 py-2 font-mono text-caption break-all select-all">
					{feed}
				</p>
				<button
					type="button"
					use:hapticTap
					onclick={copyFeed}
					class="tap accent-bg mt-2 w-full rounded-xl py-2 text-[0.8rem] font-semibold"
				>
					Copy URL
				</button>
			</div>
		{:else}
			<button
				type="button"
				onclick={revealFeed}
				disabled={feedBusy}
				class="tap hairline w-full border-b px-4 py-3 text-left text-sm disabled:opacity-50"
			>
				{feedBusy ? 'Asking the server…' : 'Show subscription URL'}
			</button>
		{/if}

		<div class="px-4 py-3 text-caption">
			{#if feedError}
				<p class="danger">{feedError}</p>
			{:else}
				<p class="dim">
					Subscribe to this URL in Google Calendar (Other calendars → From URL) or iOS
					Calendar. Open tasks with a due date appear as events; timed ones carry the reminder
					above. The lead time is baked into the URL, so changing it means re-subscribing.
				</p>
			{/if}
		</div>
	</div>
	<p class="dim mt-2 text-caption">
		Anyone with this URL can read your tasks, so treat it as a password. It works only while
		the sync server is reachable from the internet.
	</p>
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

<section class="mb-6">
	<h2 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">Data</h2>
	<div class="raised hairline rounded-2xl border">
		<div class="hairline flex items-center justify-between border-b px-4 py-3 text-sm">
			<span class="dim">Open tasks</span>
			<span class="tabular-nums">{openTasks.value.length}</span>
		</div>
		<div class="hairline flex items-center justify-between border-b px-4 py-3 text-sm">
			<span class="dim">Habits</span>
			<span class="tabular-nums">{habits.value.length}</span>
		</div>
		<button
			type="button"
			use:hapticTap
			onclick={() => {
				haptic('tap');
				downloadBackup();
			}}
			class="tap hairline w-full border-b px-4 py-3 text-left text-sm"
		>
			Export backup (JSON)
		</button>
		<button
			type="button"
			onclick={() => fileInput?.click()}
			class="tap w-full px-4 py-3 text-left text-sm"
		>
			Import backup
		</button>
		<button
			type="button"
			onclick={() => todoistInput?.click()}
			class="tap hairline w-full border-t px-4 py-3 text-left text-sm"
		>
			Import Todoist CSV
		</button>
		<input
			bind:this={fileInput}
			type="file"
			accept="application/json,.json"
			onchange={onFile}
			class="hidden"
		/>
		<input
			bind:this={todoistInput}
			type="file"
			accept=".csv,text/csv"
			onchange={onTodoistFile}
			class="hidden"
		/>
	</div>
	<p class="dim mt-2 text-caption">
		JSON import merges by record id. Todoist import adds tasks to your inbox, keeps their
		recurring-date rules, and skips projects and sections.
	</p>
</section>

<section>
	<h2 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">Quick add syntax</h2>
	<div class="raised hairline rounded-2xl border px-4 py-3 text-[0.78rem] leading-relaxed">
		<p><code class="accent-fg">today</code>, <code class="accent-fg">tomorrow</code>, <code class="accent-fg">friday</code>, <code class="accent-fg">next mon</code></p>
		<p><code class="accent-fg">in 3 days</code>, <code class="accent-fg">in 2 weeks</code></p>
		<p><code class="accent-fg">5 jan</code>, <code class="accent-fg">jan 5</code>, <code class="accent-fg">25/12</code></p>
		<p><code class="accent-fg">5pm</code>, <code class="accent-fg">at 9</code>, <code class="accent-fg">14:30</code></p>
		<p><code class="accent-fg">every day</code>, <code class="accent-fg">every other friday</code>, <code class="accent-fg">every 15th</code></p>
		<p><code class="accent-fg">p1</code>–<code class="accent-fg">p4</code> or <code class="accent-fg">!!1</code>–<code class="accent-fg">!!4</code> priority, <code class="accent-fg">#project</code></p>
	</div>
</section>

<section>
	<h2 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">Developer</h2>
	<div class="raised hairline rounded-2xl border">
		<button
			type="button"
			use:hapticTap
			onclick={() => {
				haptic('tap');
				resetLocalData();
			}}
			class="tap w-full px-4 py-3 text-left text-sm"
			class:danger={confirmReset}
		>
			{confirmReset ? 'Tap again to confirm reset' : 'Reset local data'}
		</button>
	</div>
	<p class="dim mt-2 text-caption">
		Clears this device’s local database and re-syncs from the server. Recoverable when a
		schema change leaves the local store unreadable.
	</p>
</section>
