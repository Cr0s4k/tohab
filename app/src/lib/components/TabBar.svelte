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
		inbox: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13ZM4 13h4.5l2 3h3l2-3H20',
		today: 'M7 3v3M17 3v3M4 9h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5ZM8 13h3v3H8z',
		upcoming: 'M7 3v3M17 3v3M4 9h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5ZM8 13h2M14 13h2M8 16.5h2M14 16.5h2',
		browse: 'M5.5 4h4A1.5 1.5 0 0 1 11 5.5v4A1.5 1.5 0 0 1 9.5 11h-4A1.5 1.5 0 0 1 4 9.5v-4A1.5 1.5 0 0 1 5.5 4ZM14.5 4h4A1.5 1.5 0 0 1 20 5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 13 9.5v-4A1.5 1.5 0 0 1 14.5 4ZM5.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9.5 20h-4A1.5 1.5 0 0 1 4 18.5v-4A1.5 1.5 0 0 1 5.5 13ZM14.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4a1.5 1.5 0 0 1 1.5-1.5Z'
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

<nav class="tab-bar z-30 shrink-0 md:hidden" aria-label="Primary navigation">
	{#each tabs as tab (tab.href)}
		{@const active = isActive(tab.href)}
		<a
			href={tab.href}
			use:hapticTap
			onclick={() => haptic('tap')}
			aria-current={active ? 'page' : undefined}
			class="tab tap"
			class:active
		>
			<span class="icon-well" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
					<path d={paths[tab.icon]} />
				</svg>
			</span>
			<span class="tab-label">{tab.label}</span>
		</a>
	{/each}
</nav>

<style>
	.tab-bar {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		padding: 6px 8px max(8px, env(safe-area-inset-bottom));
		border-top: 1px solid color-mix(in oklch, var(--line) 82%, transparent);
		background: color-mix(in oklch, var(--surface-raised) 92%, transparent);
		box-shadow: 0 -10px 30px color-mix(in oklch, var(--text) 5%, transparent);
		backdrop-filter: blur(24px) saturate(1.35);
		-webkit-backdrop-filter: blur(24px) saturate(1.35);
		view-transition-name: tabbar;
	}

	.tab {
		display: flex;
		min-width: 0;
		min-height: 49px;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		border-radius: 14px;
		color: var(--text-dim);
		text-decoration: none;
		transition: color 180ms ease;
	}

	.icon-well {
		display: grid;
		width: 40px;
		height: 28px;
		place-items: center;
		border-radius: 999px;
		transition:
			background-color 180ms ease,
			transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	svg {
		width: 22px;
		height: 22px;
		stroke-width: 1.75;
		transition: stroke-width 180ms ease;
	}

	.tab-label {
		max-width: 100%;
		overflow: hidden;
		font-size: 0.6875rem;
		font-weight: 600;
		line-height: 1.2;
		letter-spacing: 0.01em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tab.active {
		color: var(--accent-muted, var(--accent));
	}

	.tab.active .icon-well {
		background: var(--accent-soft);
		transform: translateY(-1px);
	}

	.tab.active svg {
		stroke-width: 2;
	}

	@media (hover: hover) and (pointer: fine) {
		.tab:not(.active):hover {
			color: var(--text);
		}

		.tab:not(.active):hover .icon-well {
			background: var(--surface-hover);
		}
	}
</style>
