<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import TabBar from '$lib/components/TabBar.svelte';
	import { applyTheme, settings } from '$lib/settings.svelte';
	import { startSync } from '$lib/db/replication.svelte';
	import { motionOk } from '$lib/motion';

	let { children } = $props();

	onNavigate((navigation) => {
		if (!document.startViewTransition || !motionOk()) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	onMount(() => {
		applyTheme();
		startSync();

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

<div class="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
	{@render children()}
	<TabBar />
</div>
