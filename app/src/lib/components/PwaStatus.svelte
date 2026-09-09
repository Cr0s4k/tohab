<script lang="ts">
	import { onMount } from 'svelte';
	import { sync } from '$lib/db/syncState.svelte';
	import { settingsSheet } from '$lib/settingsSheet.svelte';
	import { isIosLike } from '$lib/pwa';

	let waiting = $state<ServiceWorker | null>(null);
	let iosInstall = $state(false);
	let dismissed = $state(false);
	let reloadForUpdate = false;

	function activateUpdate() {
		if (!waiting) return;
		reloadForUpdate = true;
		waiting.postMessage({ type: 'SKIP_WAITING' });
	}

	onMount(() => {
		const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
		const ios = isIosLike(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
		try {
			dismissed = localStorage.getItem('tohab.installDismissed') === '1';
		} catch {
			dismissed = true;
		}
		iosInstall = ios && !standalone && !dismissed;

		if (!('serviceWorker' in navigator)) return;
		const onController = () => {
			if (reloadForUpdate) location.reload();
		};
		navigator.serviceWorker.addEventListener('controllerchange', onController);
		let registrationRef: ServiceWorkerRegistration | null = null;
		void navigator.serviceWorker.getRegistration().then((registration) => {
			if (!registration) return;
			registrationRef = registration;
			waiting = registration.waiting;
			registration.addEventListener('updatefound', () => {
				const worker = registration.installing;
				worker?.addEventListener('statechange', () => {
					if (worker.state === 'installed' && navigator.serviceWorker.controller) waiting = worker;
				});
			});
		}).catch(() => undefined);

		// The browser only refetches the worker script on navigation, which never happens for an
		// installed PWA left open in the background, so poke it whenever the app regains focus.
		const checkForUpdate = () => void registrationRef?.update().catch(() => undefined);
		const onVisibilityChange = () => {
			if (document.visibilityState === 'visible') checkForUpdate();
		};
		document.addEventListener('visibilitychange', onVisibilityChange);
		const interval = setInterval(checkForUpdate, 30 * 60 * 1000);

		return () => {
			navigator.serviceWorker.removeEventListener('controllerchange', onController);
			document.removeEventListener('visibilitychange', onVisibilityChange);
			clearInterval(interval);
		};
	});
</script>

{#if sync.phase === 'unauthorized'}
	<div class="raised hairline fixed top-[max(0.75rem,env(safe-area-inset-top))] right-3 left-3 z-[65] mx-auto flex max-w-lg items-center gap-3 rounded-2xl border p-3 shadow-xl" role="alert">
		<p class="min-w-0 flex-1 text-sm">Session expired. Local data is safe; sign out and in again to resume syncing.</p>
		<button type="button" class="tap accent-bg min-h-11 rounded-xl px-4 text-sm font-semibold" onclick={() => (settingsSheet.open = true)}>Settings</button>
	</div>
{/if}

{#if waiting}
	<div class="raised hairline fixed top-[max(0.75rem,env(safe-area-inset-top))] right-3 left-3 z-[70] mx-auto flex max-w-lg items-center gap-3 rounded-2xl border p-3 shadow-xl" role="status">
		<p class="min-w-0 flex-1 text-sm">A Tohab update is ready.</p>
		<button type="button" class="tap accent-bg min-h-11 rounded-xl px-4 text-sm font-semibold" onclick={activateUpdate}>Update</button>
	</div>
{/if}

{#if iosInstall}
	<div class="raised hairline fixed right-3 bottom-24 left-3 z-40 mx-auto max-w-md rounded-2xl border p-3 shadow-lg" role="status">
		<p class="text-sm font-medium">Install Tohab for the best offline experience</p>
		<p class="dim mt-1 text-caption">In Safari or Firefox, tap Share, then “Add to Home Screen”.</p>
		<button type="button" class="tap mt-2 min-h-11 text-sm underline" onclick={() => { localStorage.setItem('tohab.installDismissed', '1'); iosInstall = false; }}>Don’t show again</button>
	</div>
{/if}
