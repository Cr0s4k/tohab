<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import TabBar from '$lib/components/TabBar.svelte';
	import SideNav from '$lib/components/SideNav.svelte';
	import HabitNav from '$lib/components/HabitNav.svelte';
	import UndoToast from '$lib/components/UndoToast.svelte';
	import SettingsSheet from '$lib/components/SettingsSheet.svelte';
	import ConnectivityAlert from '$lib/components/ConnectivityAlert.svelte';
	import PwaStatus from '$lib/components/PwaStatus.svelte';
	import AppBadge from '$lib/components/AppBadge.svelte';
	import AuthGate from '$lib/components/AuthGate.svelte';
	import { auth } from '$lib/auth.svelte';
	import { applyTheme, settings } from '$lib/settings.svelte';
	import { settingsSheet } from '$lib/settingsSheet.svelte';
	import { taskCompose } from '$lib/compose.svelte';
	import {
		bootLocalDb,
		localDbSession,
		resetLocalDbAfterFailure,
		unmountLocalDb
	} from '$lib/db/session.svelte';
	import { motionOk } from '$lib/motion';
	import { hideSplash } from '$lib/splash';

	let { children } = $props();

	onNavigate((navigation) => {
		taskCompose.open = false;
		if (!document.startViewTransition || !motionOk()) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	$effect(() => {
		if (!auth.session || localDbSession.ready) hideSplash();
	});

	$effect(() => {
		const userId = auth.session?.userId;
		if (!userId) {
			void unmountLocalDb();
			return;
		}
		void bootLocalDb(userId);
	});

	onMount(() => {
		applyTheme();
		// Nothing below should be able to strand the boot splash over the app.
		const failsafe = setTimeout(hideSplash, 10_000);

		const media = matchMedia('(prefers-color-scheme: dark)');
		const onSystemChange = () => {
			if (settings.theme === 'system') applyTheme();
		};
		media.addEventListener('change', onSystemChange);
		return () => {
			clearTimeout(failsafe);
			media.removeEventListener('change', onSystemChange);
		};
	});
</script>

<svelte:head>
	<title>Tohab</title>
	<meta name="description" content="Offline-first tasks and habits" />
</svelte:head>

<PwaStatus />
<div class="flex h-full w-full overflow-hidden">
	{#if !auth.session}
		<div class="mx-auto flex w-full max-w-lg flex-col">
			<AuthGate />
		</div>
	{:else if localDbSession.error}
		<main class="mx-auto flex w-full max-w-lg flex-col justify-center p-6" role="alert">
			<h1 class="text-header font-semibold">Local data could not be opened</h1>
			<p class="dim mt-2 text-sm">This looks like a {localDbSession.failure} database problem. Tohab has not deleted anything.</p>
			<p class="sunken mt-3 rounded-xl p-3 text-caption break-words">{localDbSession.error}</p>
			<div class="mt-4 flex gap-3">
				<button type="button" class="tap accent-bg min-h-11 flex-1 rounded-xl px-4 font-semibold" onclick={() => void bootLocalDb(auth.session!.userId, true)}>Retry</button>
				<button type="button" class="tap danger min-h-11 flex-1 rounded-xl border px-4 font-semibold" onclick={() => void resetLocalDbAfterFailure(auth.session!.userId)}>{localDbSession.confirmingReset ? 'Confirm reset' : 'Reset local copy'}</button>
			</div>
			<p class="dim mt-3 text-caption">Reset is destructive for unsynced local changes. If deletion is blocked, close other Tohab tabs and retry.</p>
		</main>
	{:else if localDbSession.ready}
		<AppBadge />
		<SideNav />
		<div
			class="relative mx-auto flex min-w-0 w-full max-w-lg flex-1 flex-col overflow-hidden md:mx-0 md:max-w-none"
		>
			{@render children()}
			<SettingsSheet open={settingsSheet.open} onClose={() => (settingsSheet.open = false)} />
			<ConnectivityAlert />
			<UndoToast />
			{#if page.url.pathname === '/habits' || page.url.pathname === '/progress'}
				<HabitNav />
			{:else if !page.url.pathname.startsWith('/habits')}
				<TabBar />
			{/if}
		</div>
	{/if}
</div>
