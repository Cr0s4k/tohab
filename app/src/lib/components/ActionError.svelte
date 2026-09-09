<script lang="ts">
	import { actionError, clearActionError, retryAction } from '$lib/actionError.svelte';
import { veil } from '$lib/motion';
</script>

{#if actionError.current}
	<div
		class="raised hairline fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+8rem)] left-4 z-[55] mx-auto flex max-w-lg items-center gap-3 rounded-2xl border p-3 shadow-lg md:right-6 md:bottom-6 md:left-auto md:w-96"
		role="alert"
		aria-live="assertive"
		transition:veil
	>
		<span class="danger-bg grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold text-white" aria-hidden="true">!</span>
		<p class="min-w-0 flex-1 text-sm">{actionError.current.message}</p>
		{#if actionError.current.retry}
			<button type="button" class="tap accent-fg shrink-0 text-sm font-semibold" disabled={actionError.busy} onclick={() => void retryAction()}>
				{actionError.busy ? 'Retrying…' : 'Retry'}
			</button>
		{/if}
		<button type="button" aria-label="Dismiss error" class="tap dim shrink-0 p-1 text-lg leading-none" onclick={clearActionError}>×</button>
	</div>
{/if}
