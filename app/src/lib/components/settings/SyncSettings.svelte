<script lang="ts">
	import { haptic, hapticTap } from '#lib/haptics.js';
	import { auth, logout } from '#lib/auth.svelte.js';
	import { resync, restartSync, stopSync, sync } from '#lib/db/replication.svelte.js';
	import { disableNotifications } from '#lib/notifications.js';
	import { setServerUrl, setSyncEnabled, settings } from '#lib/settings.svelte.js';
	let { onNotice }: { onNotice: (message: string) => void } = $props();
	let serverDraft = $state(settings.serverUrl);
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

<section>
	<h3 class="mb-3 text-sm font-semibold">Sync</h3>
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
			<label for="settings-server-url" class="dim mb-2 block text-caption">Server URL</label>
			<div class="flex gap-2">
				<input id="settings-server-url" bind:value={serverDraft} placeholder="/sync" class="sunken min-h-11 min-w-0 flex-1 rounded-xl px-3 py-2 text-sm outline-none" />
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
			class="tap hairline min-h-11 w-full border-b px-4 py-3 text-left text-sm"
		>
			Force resync
		</button>
		<div class="px-4 py-3 text-caption">
			<p class="dim">Status: {sync.phase}{sync.message ? ` — ${sync.message}` : ''}</p>
			<p class="dim mt-1 break-all">Account: {auth.session?.email ?? 'signed out'}</p>
		</div>
	</div>
</section>

<section>
	<h3 class="mb-3 text-sm font-semibold">Account</h3>
	<div class="raised hairline rounded-2xl border">
		<button type="button" use:hapticTap onclick={signOut} class="tap min-h-11 w-full px-4 py-3 text-left text-sm">Sign out</button>
	</div>
	<p class="dim mt-2 text-caption">
		Signing out keeps this account’s isolated offline database on this device. Another account
		or sync server receives a separate local database.
	</p>
</section>
