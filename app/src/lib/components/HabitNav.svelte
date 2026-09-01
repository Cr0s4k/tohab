<script lang="ts">
	import { page } from '$app/state';
	import { haptic, hapticTap } from '$lib/haptics';
	import { HABIT_NAV_ITEMS, isNavItemActive, NAV_PATHS } from '$lib/navigation';
</script>

<nav
	class="hairline z-30 grid shrink-0 grid-cols-2 border-t backdrop-blur-xl md:hidden"
	style="background: color-mix(in oklch, var(--surface-raised) 88%, transparent); view-transition-name: habitnav"
>
	{#each HABIT_NAV_ITEMS as tab (tab.href)}
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
				stroke-width={active ? 1.8 : 1.5}
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d={NAV_PATHS[tab.icon]} />
			</svg>
			{tab.label}
		</a>
	{/each}
</nav>
