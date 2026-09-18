<script lang="ts">
	import { feedUrl } from '$lib/calendar';
	import { haptic, hapticTap } from '$lib/haptics';

	let { onNotice }: { onNotice: (message: string) => void } = $props();
	let feed = $state('');
	let feedError = $state('');
	let feedBusy = $state(false);

	async function revealFeed() {
		feedBusy = true;
		feedError = '';
		try {
			feed = await feedUrl();
		} catch (error) {
			feed = '';
			feedError = error instanceof Error ? error.message : 'Could not reach the server.';
		} finally {
			feedBusy = false;
		}
	}

	async function copyFeed() {
		try {
			await navigator.clipboard.writeText(feed);
			haptic('success');
			onNotice('Feed URL copied. Add it in Google Calendar under “From URL”.');
		} catch {
			onNotice('Copy failed — select the URL and copy it manually.');
		}
	}
</script>

<section>
	<h3 class="mb-3 text-sm font-semibold">Calendar feed</h3>
	<div class="raised hairline rounded-2xl border">
		{#if feed}
			<div class="hairline border-b px-4 py-3">
				<p class="sunken rounded-xl px-3 py-2 font-mono text-caption break-all select-all">{feed}</p>
				<button type="button" use:hapticTap onclick={copyFeed} class="tap accent-bg mt-2 w-full rounded-xl py-2 text-[0.8rem] font-semibold">Copy URL</button>
			</div>
		{:else}
			<button type="button" onclick={revealFeed} disabled={feedBusy} class="tap hairline min-h-11 w-full border-b px-4 py-3 text-left text-sm disabled:opacity-50">{feedBusy ? 'Asking the server…' : 'Show subscription URL'}</button>
		{/if}
		<div class="px-4 py-3 text-caption">
			{#if feedError}
				<p class="danger">{feedError}</p>
			{:else}
				<p class="dim">Subscribe to this URL in Google Calendar (Other calendars → From URL) or iOS Calendar. Open tasks with a due date appear as events. Task changes appear when the calendar refreshes; reminders come from Tohab notifications.</p>
			{/if}
		</div>
	</div>
	<p class="dim mt-2 text-caption">Anyone with this URL can read your tasks, so treat it as a password. It works only while the sync server is reachable from the internet.</p>
</section>
