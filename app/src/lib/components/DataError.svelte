<script lang="ts">
	let { onRetry, label = 'your data' }: { onRetry: () => void; label?: string } = $props();
</script>

<div class="sunken measure mx-4 my-3 flex items-center gap-3 rounded-2xl border px-4 py-3" style="border-color: color-mix(in oklch, var(--danger) 30%, transparent)" role="alert">
	<span class="danger-bg grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold text-white" aria-hidden="true">!</span>
	<p class="min-w-0 flex-1 text-sm">Couldn’t load {label}. Your local changes are safe.</p>
	<button type="button" class="tap accent-fg shrink-0 text-sm font-semibold" onclick={onRetry}>Retry</button>
</div>
