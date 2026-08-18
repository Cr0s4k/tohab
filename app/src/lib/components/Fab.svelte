<script lang="ts">
	import { haptic, hapticTap } from '$lib/haptics';

	let {
		label,
		onPress,
		withTabBar = true,
		mobileOnly = false
	}: {
		label: string;
		onPress: () => void;
		withTabBar?: boolean;
		mobileOnly?: boolean;
	} = $props();
</script>

<!-- Anchored to the app column, so it stays beside the list on wide screens instead of
     drifting to the window edge. -->
<div
	class="pointer-events-none absolute inset-x-0 bottom-0 z-40 {mobileOnly ? 'md:hidden' : ''}"
>
	<div class="fab-pad flex justify-end px-4" style:--fab-gap={withTabBar ? '4.75rem' : '1.25rem'}>
		<button
			type="button"
			use:hapticTap
			aria-label={label}
			onclick={() => {
				haptic('tap');
				onPress();
			}}
			class="tap accent-bg pointer-events-auto grid size-14 place-items-center rounded-full shadow-lg transition-shadow hover:shadow-xl md:size-12"
		>
			<svg
				viewBox="0 0 24 24"
				class="size-7"
				fill="none"
				stroke="currentColor"
				stroke-width="2.6"
				stroke-linecap="round"
			>
				<path d="M12 5v14M5 12h14" />
			</svg>
		</button>
	</div>
</div>

<style>
	.fab-pad {
		padding-bottom: calc(env(safe-area-inset-bottom) + var(--fab-gap));
	}

	/* The tab bar the button clears only exists below md. */
	@media (min-width: 768px) {
		.fab-pad {
			padding-bottom: 1.5rem;
		}
	}
</style>
