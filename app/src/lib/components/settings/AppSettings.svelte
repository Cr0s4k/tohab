<script lang="ts">
	import { haptic, hapticTap } from '#lib/haptics.js';
	async function forceReload() {
		haptic('tap');
		try {
			if ('serviceWorker' in navigator) {
				const registrations = await navigator.serviceWorker.getRegistrations();
				await Promise.all(registrations.map((registration) => registration.unregister()));
			}
			if ('caches' in window) {
				const keys = await caches.keys();
				await Promise.all(keys.map((key) => caches.delete(key)));
			}
		} catch {
			// best effort — reload regardless
		}
		location.reload();
	}
</script>

<section>
	<h3 class="mb-3 text-sm font-semibold">App</h3>
	<div class="raised hairline rounded-2xl border">
		<button type="button" use:hapticTap onclick={forceReload} class="tap min-h-11 w-full px-4 py-3 text-left text-sm">
			Force reload app
		</button>
	</div>
	<p class="dim mt-2 text-caption">
		Unregisters the service worker and clears cached files, then reloads. Use this if the app
		seems stuck on an old version.
	</p>
</section>
