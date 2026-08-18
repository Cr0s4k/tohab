<script lang="ts">
	import { page } from '$app/state';
	import { settingsSheet } from '$lib/settingsSheet.svelte';

	const groups = [
		{
			label: 'Tasks',
			items: [
				{ href: '/tasks?view=inbox', label: 'Inbox', icon: 'inbox' },
				{ href: '/tasks?view=today', label: 'Today', icon: 'today' },
				{ href: '/tasks?view=upcoming', label: 'Upcoming', icon: 'upcoming' },
				{ href: '/browse', label: 'Browse', icon: 'browse' }
			]
		},
		{
			label: 'Habits',
			items: [
				{ href: '/habits', label: 'Journal', icon: 'journal' },
				{ href: '/progress', label: 'Progress', icon: 'progress' }
			]
		}
	];

	const paths: Record<string, string> = {
		inbox: 'M4 4h16v13a3 3 0 01-3 3H7a3 3 0 01-3-3V4zM4 13h5l2 2 4-4h5',
		today: 'M7 2v4M17 2v4M4 10h16M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
		upcoming: 'M8 2v4M16 2v4M4 10h16M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM9 15h6',
		browse: 'M4 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V6z',
		journal: 'M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM3 9h18M8 3v4M16 3v4',
		progress: 'M4 19V5M4 19h16M7 15l3-3 3 3 5-6',
		settings:
			'M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2v.2a2 2 0 01-4 0v-.1a1.7 1.7 0 00-2.9-1.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1A1.7 1.7 0 003.6 14H3.4a2 2 0 010-4h.2a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 012.8-2.8l.1.1A1.7 1.7 0 0010 3.6V3.4a2 2 0 014 0v.2a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 012.8 2.8l-.1.1A1.7 1.7 0 0021 10h.2a2 2 0 010 4H21a1.7 1.7 0 00-1.6 1z'
	};

	function isActive(href: string) {
		const [path, query = ''] = href.split('?');
		if (path === '/browse') {
			return page.url.pathname === '/browse' || page.url.pathname.startsWith('/projects');
		}
		if (path === '/habits') return page.url.pathname.startsWith('/habits');
		if (page.url.pathname === path || page.url.pathname.startsWith(`${path}/`)) {
			if (query) {
				return (
					new URLSearchParams(page.url.search).get('view') ===
					new URLSearchParams(query).get('view')
				);
			}
			return true;
		}
		return false;
	}
</script>

<aside
	class="surface hairline hidden w-56 shrink-0 flex-col border-r md:flex"
	style="view-transition-name: sidenav"
>
	<div class="flex items-center gap-2 px-5 pt-5 pb-4">
		<span class="text-lg font-bold tracking-tight">Tohab</span>
	</div>

	<nav class="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
		{#each groups as group (group.label)}
			<h2 class="dim px-2.5 pt-3 pb-1.5 text-[0.66rem] font-semibold tracking-wide uppercase">
				{group.label}
			</h2>
			{#each group.items as item (item.href)}
				{@const active = isActive(item.href)}
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class="nav-item"
					class:nav-active={active}
				>
					<svg
						viewBox="0 0 24 24"
						class="size-[1.15rem] shrink-0"
						fill="none"
						stroke="currentColor"
						stroke-width={active ? 2.3 : 1.85}
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d={paths[item.icon]} />
					</svg>
					{item.label}
				</a>
			{/each}
		{/each}
	</nav>

	<div class="hairline border-t px-2.5 py-2.5">
		<button type="button" onclick={() => (settingsSheet.open = true)} class="nav-item w-full">
			<svg
				viewBox="0 0 24 24"
				class="size-[1.15rem] shrink-0"
				fill="none"
				stroke="currentColor"
				stroke-width="1.85"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d={paths.settings} />
			</svg>
			Settings
		</button>
	</div>
</aside>

<style>
	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		border-radius: 0.7rem;
		padding: 0.5rem 0.65rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-dim);
		transition:
			background-color 140ms ease,
			color 140ms ease;
	}

	.nav-item:hover {
		background: var(--surface-sunken);
		color: var(--text);
	}

	.nav-active {
		background: var(--surface-sunken);
		color: var(--accent-muted, var(--accent));
		font-weight: 600;
	}
</style>
