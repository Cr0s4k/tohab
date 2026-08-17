<script lang="ts">
	import { page } from '$app/state';
	import { haptic } from '$lib/haptics';

	const tabs = [
		{ href: '/tasks', label: 'Tasks', icon: 'check' },
		{ href: '/habits', label: 'Habits', icon: 'flame' },
		{ href: '/settings', label: 'Settings', icon: 'gear' }
	];

	const paths: Record<string, string> = {
		check: 'M4 12.5l5 5L20 6.5',
		flame: 'M12 2c1 4-3 5-3 9a3 3 0 006 0c0-1-.5-2-1-3 2 1.5 4 3.6 4 6.5A6 6 0 116 15c0-5 6-6 6-13z',
		gear: 'M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2v.2a2 2 0 01-4 0v-.1a1.7 1.7 0 00-2.9-1.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1A1.7 1.7 0 003.6 14H3.4a2 2 0 010-4h.2a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 012.8-2.8l.1.1A1.7 1.7 0 0010 3.6V3.4a2 2 0 014 0v.2a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 012.8 2.8l-.1.1A1.7 1.7 0 0021 10h.2a2 2 0 010 4H21a1.7 1.7 0 00-1.6 1z'
	};

	function isActive(href: string) {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}
</script>

<nav
	class="hairline sticky bottom-0 z-30 grid grid-cols-3 border-t pb-safe backdrop-blur-xl"
	style="background: color-mix(in oklch, var(--surface-raised) 88%, transparent)"
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
		>
			<svg
				viewBox="0 0 24 24"
				class="size-6"
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
