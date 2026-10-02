<script lang="ts">
	import { haptic, hapticTap } from '#lib/haptics.js';
	import { removeDb } from '#lib/db/lazy.js';
	import { stopSync } from '#lib/db/replication.svelte.js';
	let { onNotice }: { onNotice: (message: string) => void } = $props();
	let confirmReset = $state(false);
	async function resetLocalData() {
		if (!confirmReset) {
			confirmReset = true;
			onNotice('Tap again to confirm — this clears this device’s local copy.');
			return;
		}
		confirmReset = false;
		await stopSync();
		await removeDb();
		location.reload();
	}
</script>

<section>
	<h3 class="mb-3 text-sm font-semibold">Developer</h3>
	<div class="raised hairline rounded-2xl border">
		<button type="button" use:hapticTap onclick={() => { haptic('tap'); void resetLocalData(); }} class="tap min-h-11 w-full px-4 py-3 text-left text-sm" class:danger={confirmReset}>{confirmReset ? 'Tap again to confirm reset' : 'Reset local data'}</button>
	</div>
	<p class="dim mt-2 text-caption">Clears this device’s local database and re-syncs from the server. Recoverable when a schema change leaves the local store unreadable.</p>
</section>
