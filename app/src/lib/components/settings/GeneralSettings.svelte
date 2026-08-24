<script lang="ts">
	import { auth, logout } from '$lib/auth.svelte';
	import { resync, restartSync, stopSync, sync } from '$lib/db/replication.svelte';
	import { haptic, hapticTap } from '$lib/haptics';
	import { disableNotifications } from '$lib/notifications';
	import {
		setServerUrl,
		setSound,
		setStartOfWeek,
		setSyncEnabled,
		setTheme,
		settings,
		type Theme
	} from '$lib/settings.svelte';

	let { onNotice }: { onNotice: (message: string) => void } = $props();
	let serverDraft = $state(settings.serverUrl);

	const themes: { id: Theme; label: string }[] = [
		{ id: 'system', label: 'System' },
		{ id: 'light', label: 'Light' },
		{ id: 'dark', label: 'Dark' }
	];

	async function applyServer() {
		await stopSync();
		setServerUrl(serverDraft.trim() || '/sync');
		location.reload();
	}

	async function signOut() {
		haptic('tap');
		await disableNotifications(settings.serverUrl).catch(() => undefined);
		await stopSync();
		await logout();
	}
</script>

<section class="mb-6">
	<h2 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">Appearance</h2>
	<div class="flex gap-1.5">
		{#each themes as theme (theme.id)}
			<button
				type="button"
				use:hapticTap
				onclick={() => {
					haptic('tap');
					setTheme(theme.id);
				}}
				aria-pressed={settings.theme === theme.id}
				class="tap min-h-11 flex-1 rounded-xl py-2.5 text-sm font-medium"
				class:accent-bg={settings.theme === theme.id}
				class:sunken={settings.theme !== theme.id}
			>
				{theme.label}
			</button>
		{/each}
	</div>

	<h2 class="dim mt-4 mb-2 text-caption font-semibold tracking-wide uppercase">Week starts on</h2>
	<div class="flex gap-1.5">
		{#each [{ id: 1, label: 'Monday' }, { id: 0, label: 'Sunday' }] as option (option.id)}
			<button
				type="button"
				onclick={() => setStartOfWeek(option.id as 0 | 1)}
				aria-pressed={settings.startOfWeek === option.id}
				class="tap min-h-11 flex-1 rounded-xl py-2.5 text-sm font-medium"
				class:accent-bg={settings.startOfWeek === option.id}
				class:sunken={settings.startOfWeek !== option.id}
			>
				{option.label}
			</button>
		{/each}
	</div>

	<div class="raised hairline mt-4 rounded-2xl border">
		<label class="flex items-center justify-between gap-3 px-4 py-3">
			<span class="text-sm">Sound on complete</span>
			<input
				type="checkbox"
				checked={settings.sound}
				onchange={(event) => setSound(event.currentTarget.checked)}
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
				onchange={(event) => {
					setSyncEnabled(event.currentTarget.checked);
					void restartSync();
				}}
				class="size-5 accent-current"
			/>
		</label>
		<div class="hairline border-b px-4 py-3">
			<p class="dim mb-1.5 text-caption">Server URL</p>
			<div class="flex gap-2">
				<input bind:value={serverDraft} placeholder="/sync" class="sunken min-w-0 flex-1 rounded-xl px-3 py-2 text-sm outline-none" />
				<button type="button" onclick={applyServer} class="tap accent-bg rounded-xl px-4 text-sm font-semibold">Apply</button>
			</div>
		</div>
		<button
			type="button"
			use:hapticTap
			onclick={() => {
				haptic('tap');
				resync();
				onNotice('Requested a fresh pull from the server.');
			}}
			class="tap hairline w-full border-b px-4 py-3 text-left text-sm"
		>
			Force resync
		</button>
		<div class="px-4 py-3 text-caption">
			<p class="dim">Status: {sync.phase}{sync.message ? ` — ${sync.message}` : ''}</p>
			<p class="dim mt-1 break-all">Account: {auth.session?.email ?? 'signed out'}</p>
		</div>
	</div>
</section>

<section class="mb-6">
	<h2 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">Account</h2>
	<div class="raised hairline rounded-2xl border">
		<button type="button" use:hapticTap onclick={signOut} class="tap w-full px-4 py-3 text-left text-sm">Sign out</button>
	</div>
	<p class="dim mt-2 text-caption">
		Signing out keeps this account’s isolated offline database on this device. Another account
		or sync server receives a separate local database.
	</p>
</section>
