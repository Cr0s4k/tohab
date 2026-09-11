<script lang="ts">
	let {
		value = 0,
		target = 1,
		color = 'currentColor',
		size = 44,
		label = '',
		invert = false
	}: {
		value?: number;
		target?: number;
		color?: string;
		size?: number;
		label?: string;
		invert?: boolean;
	} = $props();

	const stroke = 3.5;
	let radius = $derived((size - stroke) / 2);
	let circumference = $derived(2 * Math.PI * radius);
	let ratio = $derived(
		invert
			? Math.min(1, Math.max(0, target > 0 ? (target - value) / target : (value <= target ? 1 : 0)))
			: Math.min(1, target > 0 ? value / target : 0)
	);
	let complete = $derived(invert ? value <= target : ratio >= 1);
</script>

<div
	class="progress-ring relative grid shrink-0 place-items-center"
	class:progress-ring--complete={complete}
	style="width: {size}px; height: {size}px"
>
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

	<span class="progress-ring__label text-[0.7rem] font-semibold tabular-nums" class:dim={value === 0} aria-hidden={complete ? 'true' : undefined}>{label}</span>
	<svg
		viewBox="0 0 24 24"
		class="progress-ring__check size-5"
		fill="none"
		stroke={color}
		stroke-width="3.2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path pathLength="1" d="M4 12.5l5 5L20 6.5" />
	</svg>
</div>

<style>
	.progress-ring__label,
	.progress-ring__check {
		transition:
			opacity var(--motion-feedback) ease,
			transform var(--motion-state) var(--motion-ease-out);
	}

	.progress-ring__label {
		position: relative;
		transform: scale(1);
	}

	.progress-ring__check {
		position: absolute;
		opacity: 0;
		transform: scale(0.72);
		transform-box: fill-box;
		transform-origin: center;
	}

	.progress-ring__check path {
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		transition: stroke-dashoffset var(--motion-state) var(--motion-ease-out);
	}

	.progress-ring--complete .progress-ring__label {
		opacity: 0;
		transform: scale(0.82);
	}

	.progress-ring--complete .progress-ring__check {
		opacity: 1;
		transform: scale(1);
	}

	.progress-ring--complete .progress-ring__check path {
		stroke-dashoffset: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.progress-ring__label,
		.progress-ring__check {
			transform: none;
			transition: opacity var(--motion-feedback) ease !important;
		}

		.progress-ring__check path {
			stroke-dasharray: none;
			stroke-dashoffset: 0;
			transition: none !important;
		}
	}
</style>
