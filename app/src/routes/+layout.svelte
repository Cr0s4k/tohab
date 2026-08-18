<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import TabBar from '$lib/components/TabBar.svelte';
	import HabitNav from '$lib/components/HabitNav.svelte';
	import UndoToast from '$lib/components/UndoToast.svelte';
	import SettingsSheet from '$lib/components/SettingsSheet.svelte';
	import AuthGate from '$lib/components/AuthGate.svelte';
	import { auth } from '$lib/auth.svelte';
	import { applyTheme, settings } from '$lib/settings.svelte';
	import { settingsSheet } from '$lib/settingsSheet.svelte';
	import { startSync } from '$lib/db/replication.svelte';
	import { removeDb } from '$lib/db';
	import { motionOk } from '$lib/motion';

	let { children } = $props();

	let ready = $state(false);

	/**
	 * The local store belongs to one account. If the signed-in id is not the one it was built
	 * for — a different account, or the pre-auth device id — it is dropped rather than pushed
	 * up under the new owner.
	 */
	async function adoptLocalDb(userId: string) {
		const owner = localStorage.getItem('tohab.dbOwner');
		if (owner !== userId) {
			if (owner !== null || localStorage.getItem('tohab.userId')) await removeDb();
			localStorage.removeItem('tohab.userId');
			localStorage.setItem('tohab.dbOwner', userId);
		}
	}

	onNavigate((navigation) => {
		if (!document.startViewTransition || !motionOk()) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	$effect(() => {
		const userId = auth.session?.userId;
		if (!userId) {
			ready = false;
			return;
		}
		adoptLocalDb(userId).then(() => {
			ready = true;
			startSync();
		});
	});

	onMount(() => {
		applyTheme();

		const media = matchMedia('(prefers-color-scheme: dark)');
		const onSystemChange = () => {
			if (settings.theme === 'system') applyTheme();
		};
		media.addEventListener('change', onSystemChange);
		return () => media.removeEventListener('change', onSystemChange);
	});
</script>

<svelte:head>
	<title>Tohab</title>
	<meta name="description" content="Offline-first tasks and habits" />
</svelte:head>

<div class="relative mx-auto flex h-dvh w-full max-w-lg flex-col overflow-hidden">
	{#if !auth.session}
		<AuthGate />
	{:else if ready}
		{@render children()}
		<SettingsSheet open={settingsSheet.open} onClose={() => (settingsSheet.open = false)} />
		<UndoToast />
		{#if page.url.pathname === '/habits' || page.url.pathname === '/progress'}
			<HabitNav />
		{:else if !page.url.pathname.startsWith('/habits')}
			<TabBar />
		{/if}
	{/if}
</div>
