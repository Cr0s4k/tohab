<script lang="ts">
	import { haptic } from '$lib/haptics';

	let {
		label,
		onPress,
		withTabBar = true
	}: { label: string; onPress: () => void; withTabBar?: boolean } = $props();
</script>

<!-- Fixed to the viewport but constrained to the app column, so it stays beside the list on
     wide screens instead of drifting to the window edge. -->
<div class="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-lg">
	<div
		class="flex justify-end px-4"
		style:padding-bottom={withTabBar
			? 'calc(env(safe-area-inset-bottom) + 4.75rem)'
			: 'calc(env(safe-area-inset-bottom) + 1.25rem)'}
	>
		<button
			type="button"
			aria-label={label}
			onclick={() => {
				haptic('tap');
				onPress();
			}}
			class="tap accent-bg pointer-events-auto grid size-14 place-items-center rounded-full shadow-lg"
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
