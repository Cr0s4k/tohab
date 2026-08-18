<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { settings, setSidebarCollapsed } from '$lib/settings.svelte';
	import { settingsSheet } from '$lib/settingsSheet.svelte';
	import { habitCompose, taskCompose } from '$lib/compose.svelte';
	import UndoToast from '$lib/components/UndoToast.svelte';

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
			'M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2v.2a2 2 0 01-4 0v-.1a1.7 1.7 0 00-2.9-1.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1A1.7 1.7 0 003.6 14H3.4a2 2 0 010-4h.2a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 012.8-2.8l.1.1A1.7 1.7 0 0010 3.6V3.4a2 2 0 014 0v.2a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 012.8 2.8l-.1.1A1.7 1.7 0 0021 10h.2a2 2 0 010 4H21a1.7 1.7 0 00-1.6 1z',
		collapse: 'M11 17l-5-5 5-5M18 17l-5-5 5-5',
		add: 'M12 5v14M5 12h14'
	};

	let collapsed = $derived(settings.sidebarCollapsed);

	let inHabits = $derived(
		page.url.pathname.startsWith('/habits') || page.url.pathname === '/progress'
	);
	let addLabel = $derived(inHabits ? 'Add habit' : 'Add task');

	async function add() {
		const path = page.url.pathname;
		if (inHabits) {
			if (path !== '/habits') await goto('/habits');
			habitCompose.open = true;
			return;
		}
		if (path !== '/tasks' && !path.startsWith('/projects/')) await goto('/tasks?view=today');
		taskCompose.open = true;
	}

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
	class="raised hairline hidden shrink-0 flex-col border-r md:flex"
	class:rail={collapsed}
	class:panel={!collapsed}
	style="view-transition-name: sidenav"
>
	<div class="flex items-center px-2.5 pt-4 pb-2" class:justify-center={collapsed}>
		{#if !collapsed}
			<span class="flex-1 pl-2.5 text-subtitle font-semibold tracking-tight">Tohab</span>
		{/if}
		<button
			type="button"
			aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
			aria-expanded={!collapsed}
			title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
			onclick={() => setSidebarCollapsed(!collapsed)}
			class="nav-item"
		>
			<svg
				viewBox="0 0 24 24"
				class="size-[1.15rem] shrink-0"
				style="transform: rotate({collapsed ? 180 : 0}deg); transition: transform 200ms ease"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d={paths.collapse} />
			</svg>
		</button>
	</div>

	<nav class="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
		<button
			type="button"
			title={collapsed ? addLabel : undefined}
			onclick={add}
			class="nav-item nav-add w-full"
		>
			<svg
				viewBox="0 0 24 24"
				class="size-[1.15rem] shrink-0"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d={paths.add} />
			</svg>
			{#if !collapsed}
				{addLabel}
			{/if}
		</button>

		{#each groups as group (group.label)}
			{#if collapsed}
				<hr class="hairline mx-1.5 my-2.5 border-t" />
			{:else}
				<h2 class="dim px-2.5 pt-3 pb-1.5 text-body font-semibold">
					{group.label}
				</h2>
			{/if}
			{#each group.items as item (item.href)}
				{@const active = isActive(item.href)}
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					title={collapsed ? item.label : undefined}
					class="nav-item"
					class:nav-active={active}
				>
					<svg
						viewBox="0 0 24 24"
						class="size-[1.15rem] shrink-0"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d={paths[item.icon]} />
					</svg>
					{#if !collapsed}
						{item.label}
					{/if}
				</a>
			{/each}
		{/each}
	</nav>

	<UndoToast placement="sidebar" {collapsed} />

	<div class="hairline border-t px-2.5 py-2.5">
		<button
			type="button"
			title={collapsed ? 'Settings' : undefined}
			onclick={() => (settingsSheet.open = true)}
			class="nav-item w-full"
		>
			<svg
				viewBox="0 0 24 24"
				class="size-[1.15rem] shrink-0"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d={paths.settings} />
			</svg>
			{#if !collapsed}
				Settings
			{/if}
		</button>
	</div>
</aside>

<style>
	.panel {
		width: 14rem;
	}

	.rail {
		width: 4rem;
	}

	.panel,
	.rail {
		transition: width 200ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		border-radius: 0.7rem;
		padding: 0.5rem 0.65rem;
		font-size: 0.875rem;
		font-weight: 400;
		color: var(--text);
		transition: background-color 140ms ease;
	}

	.rail .nav-item {
		justify-content: center;
	}

	.nav-item:hover {
		background: var(--surface-sunken);
	}

	.nav-add {
		color: var(--accent-muted, var(--accent));
		font-weight: 600;
	}

	.nav-active {
		background: var(--selected-bg);
		color: var(--selected-text);
		font-weight: 400;
	}
</style>
