<script lang="ts">
	import { page } from '$app/state';
	import { haptic, hapticTap } from '#lib/haptics.js';
	import { isNavItemActive, NAV_PATHS, TASK_NAV_ITEMS } from '#lib/navigation.js';
	let activeIndex = $derived(TASK_NAV_ITEMS.findIndex((tab) => isNavItemActive(page.url, tab.href)));
</script>

<nav
	class="raised hairline relative z-30 grid shrink-0 grid-cols-4 border-t pb-safe md:hidden"
	style="view-transition-name: tabbar"
>
	<span class="mobile-nav__indicator" aria-hidden="true" style="view-transition-name: task-nav-indicator; --nav-count: {TASK_NAV_ITEMS.length}; --nav-index: {Math.max(0, activeIndex)}; opacity: {activeIndex < 0 ? 0 : 1}"></span>
	{#each TASK_NAV_ITEMS as tab (tab.href)}
		{@const active = isNavItemActive(page.url, tab.href)}
		<a
			href={tab.href}
			use:hapticTap
			onclick={() => haptic('tap')}
			aria-current={active ? 'page' : undefined}
			class="tap flex flex-col items-center gap-1 pt-2.5 pb-1 text-caption font-medium"
			class:accent-fg={active}
			class:dim={!active}
			style="transition: color 180ms ease"
		>
			<svg
				viewBox="0 0 24 24"
				class="size-6"
				style="transform: scale({active ? 1.06 : 1}); transition: transform 220ms cubic-bezier(0.22,1,0.36,1), stroke-width 180ms ease"
				fill="none"
				stroke="currentColor"
				stroke-width={active ? 1.5 : 1.25}
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d={NAV_PATHS[tab.icon]} />
			</svg>
			{tab.label}
		</a>
	{/each}
</nav>
