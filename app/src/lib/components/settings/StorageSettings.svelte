<script lang="ts">
	import { onMount } from 'svelte';

	let storageStatus = $state('Checking storage…');
	let storagePersistent = $state(false);

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

	onMount(() => {
		void refreshStorage();
	});
</script>

<section>
	<h3 class="mb-3 text-sm font-semibold">Storage</h3>
	<div class="raised hairline rounded-2xl border p-4">
		<p class="text-sm">{storageStatus}</p>
		{#if !storagePersistent}
			<button type="button" class="tap accent-fg mt-2 min-h-11 text-sm font-semibold" onclick={requestPersistentStorage}>Request persistent storage</button>
		{/if}
	</div>
</section>
