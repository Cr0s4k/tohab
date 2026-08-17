<script lang="ts">
	let {
		value = 0,
		target = 1,
		color = 'currentColor',
		size = 44,
		label = ''
	}: { value?: number; target?: number; color?: string; size?: number; label?: string } = $props();

	const stroke = 3.5;
	let radius = $derived((size - stroke) / 2);
	let circumference = $derived(2 * Math.PI * radius);
	let ratio = $derived(Math.min(1, target > 0 ? value / target : 0));
	let complete = $derived(ratio >= 1);
</script>

<div class="relative grid shrink-0 place-items-center" style="width: {size}px; height: {size}px">
	<svg viewBox="0 0 {size} {size}" class="absolute inset-0 -rotate-90" style="width: {size}px; height: {size}px">
		<circle
			cx={size / 2}
			cy={size / 2}
			r={radius}
			fill="none"
			stroke="var(--line)"
			stroke-width={stroke}
		/>
		<circle
			cx={size / 2}
			cy={size / 2}
			r={radius}
			fill="none"
			stroke={color}
			stroke-width={stroke}
			stroke-linecap="round"
			stroke-dasharray={circumference}
			stroke-dashoffset={circumference * (1 - ratio)}
			style="transition: stroke-dashoffset 260ms cubic-bezier(0.22,1,0.36,1)"
		/>
	</svg>

	{#if complete}
		<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke={color} stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M4 12.5l5 5L20 6.5" />
		</svg>
	{:else}
		<span class="text-[0.7rem] font-semibold tabular-nums" class:dim={value === 0}>{label}</span>
	{/if}
</div>
