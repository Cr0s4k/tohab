<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { settings, setSidebarCollapsed } from '$lib/settings.svelte';
	import { settingsSheet } from '$lib/settingsSheet.svelte';
	import { habitCompose, taskCompose } from '$lib/compose.svelte';
	import { isNavItemActive, NAV_GROUPS, NAV_PATHS } from '$lib/navigation';
	import UndoToast from '$lib/components/UndoToast.svelte';

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

</script>

<aside
	class="raised hairline hidden shrink-0 flex-col md:flex"
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
				<path d={NAV_PATHS.collapse} />
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
				<path d={NAV_PATHS.add} />
			</svg>
			{#if !collapsed}
				{addLabel}
			{/if}
		</button>

		{#each NAV_GROUPS as group (group.label)}
			{#if collapsed}
				<hr class="hairline mx-1.5 my-2.5 border-t" />
			{:else}
				<h2 class="dim px-2.5 pt-3 pb-1.5 text-body font-semibold">
					{group.label}
				</h2>
			{/if}
			{#each group.items as item (item.href)}
				{@const active = isNavItemActive(page.url, item.href)}
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
						<path d={NAV_PATHS[item.icon]} />
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
				<path d={NAV_PATHS.settings} />
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
