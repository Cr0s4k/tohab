<script lang="ts">
	import { page } from '$app/state';
	import { haptic, hapticTap } from '$lib/haptics';

	const tabs = [
		{ href: '/tasks?view=inbox', label: 'Inbox', icon: 'inbox' },
		{ href: '/tasks?view=today', label: 'Today', icon: 'today' },
		{ href: '/tasks?view=upcoming', label: 'Upcoming', icon: 'upcoming' },
		{ href: '/browse', label: 'Browse', icon: 'browse' }
	];

	const paths: Record<string, string> = {
		check: 'M4 12.5l5 5L20 6.5',
		flame: 'M12 2c1 4-3 5-3 9a3 3 0 006 0c0-1-.5-2-1-3 2 1.5 4 3.6 4 6.5A6 6 0 116 15c0-5 6-6 6-13z',
		inbox: 'M4 4h16v13a3 3 0 01-3 3H7a3 3 0 01-3-3V4zM4 13h5l2 2 4-4h5',
		today: 'M7 2v4M17 2v4M4 10h16M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
		upcoming: 'M8 2v4M16 2v4M4 10h16M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM9 15h6',
		browse: 'M4 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V6z'
	};

	function isActive(href: string) {
		const [path, query = ''] = href.split('?');
		if (path === '/browse') {
			return page.url.pathname === '/browse' || page.url.pathname.startsWith('/projects');
		}
		if (page.url.pathname === path || page.url.pathname.startsWith(`${path}/`)) {
			if (query) return new URLSearchParams(page.url.search).get('view') === new URLSearchParams(query).get('view');
			return true;
		}
		return false;
	}
</script>

<nav
	class="hairline z-30 grid shrink-0 grid-cols-4 border-t pb-safe backdrop-blur-xl md:hidden"
	style="background: color-mix(in oklch, var(--surface-raised) 88%, transparent); view-transition-name: tabbar"
>
	{#each tabs as tab (tab.href)}
		{@const active = isActive(tab.href)}
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
