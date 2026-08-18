<script lang="ts">
	import { page } from '$app/state';
	import { haptic } from '$lib/haptics';

	const tabs = [
		{ href: '/habits', label: 'Journal', icon: 'journal' },
		{ href: '/progress', label: 'Progress', icon: 'progress' }
	];

	const paths: Record<string, string> = {
		journal: 'M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM3 9h18M8 3v4M16 3v4',
		flame: 'M12 2c1 4-3 5-3 9a3 3 0 006 0c0-1-.5-2-1-3 2 1.5 4 3.6 4 6.5A6 6 0 116 15c0-5 6-6 6-13z',
		progress: 'M4 19V5M4 19h16M7 15l3-3 3 3 5-6'
	};

	function isActive(href: string) {
		if (href === '/habits') return page.url.pathname === '/habits';
		if (href === '/progress') return page.url.pathname === '/progress';
		return false;
	}
</script>

<nav
	class="hairline z-30 grid shrink-0 grid-cols-2 border-t pb-safe backdrop-blur-xl md:hidden"
	style="background: color-mix(in oklch, var(--surface-raised) 88%, transparent); view-transition-name: habitnav"
>
	{#each tabs as tab (tab.href)}
		{@const active = isActive(tab.href)}
		<a
			href={tab.href}
			onclick={() => haptic('tap')}
			aria-current={active ? 'page' : undefined}
			class="tap flex flex-col items-center gap-1 pt-2.5 pb-1 text-[0.68rem] font-medium"
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
				stroke-width={active ? 2.4 : 1.9}
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d={paths[tab.icon]} />
			</svg>
			{tab.label}
		</a>
	{/each}
</nav>
