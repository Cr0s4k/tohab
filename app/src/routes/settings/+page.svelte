<script lang="ts">
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import { habitsQuery } from '$lib/habits';
	import { openTasksQuery } from '$lib/tasks';
	import { downloadBackup, importBackup } from '$lib/backup';
	import { resync, restartSync, sync } from '$lib/db/replication.svelte';
	import {
		setServerUrl,
		setStartOfWeek,
		setSyncEnabled,
		setTheme,
		settings,
		type Theme
	} from '$lib/settings.svelte';
	import { haptic } from '$lib/haptics';
	import SyncBadge from '$lib/components/SyncBadge.svelte';

	let serverDraft = $state(settings.serverUrl);
	let notice = $state('');
	let fileInput: HTMLInputElement | null = $state(null);

	let habits = rx(() => (live.db ? habitsQuery(live.db, true).$ : null), []);
	let openTasks = rx(() => (live.db ? openTasksQuery(live.db).$ : null), []);

	async function onFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const result = await importBackup(await file.text());
			notice = `Imported ${result.imported} records${result.skipped ? `, skipped ${result.skipped}` : ''}.`;
			haptic('success');
		} catch (err) {
			notice = err instanceof Error ? err.message : 'Import failed.';
			haptic('warn');
		}
		if (fileInput) fileInput.value = '';
	}

	async function applyServer() {
		setServerUrl(serverDraft.trim() || '/sync');
		await restartSync();
		notice = 'Sync target updated.';
	}

	const themes: { id: Theme; label: string }[] = [
		{ id: 'system', label: 'System' },
		{ id: 'light', label: 'Light' },
		{ id: 'dark', label: 'Dark' }
	];
</script>

<header class="hairline raised sticky top-0 z-20 border-b pt-safe">
	<div class="flex items-center justify-between px-4 pt-2 pb-3">
		<h1 class="text-2xl font-bold tracking-tight">Settings</h1>
		<SyncBadge />
	</div>
</header>

<main class="flex-1 px-4 py-4">
	{#if notice}
		<p class="sunken mb-4 rounded-xl px-3 py-2 text-[0.8rem]">{notice}</p>
	{/if}

	<section class="mb-6">
		<h2 class="dim mb-2 text-[0.7rem] font-semibold tracking-wide uppercase">Appearance</h2>
		<div class="flex gap-1.5">
			{#each themes as t (t.id)}
				<button
					type="button"
					onclick={() => {
						haptic('tap');
						setTheme(t.id);
					}}
					class="tap flex-1 rounded-xl py-2.5 text-[0.8rem] font-medium"
					class:accent-bg={settings.theme === t.id}
					class:sunken={settings.theme !== t.id}
				>
					{t.label}
				</button>
			{/each}
		</div>

		<h2 class="dim mt-4 mb-2 text-[0.7rem] font-semibold tracking-wide uppercase">Week starts on</h2>
		<div class="flex gap-1.5">
			{#each [{ id: 1, label: 'Monday' }, { id: 0, label: 'Sunday' }] as opt (opt.id)}
				<button
					type="button"
					onclick={() => setStartOfWeek(opt.id as 0 | 1)}
					class="tap flex-1 rounded-xl py-2.5 text-[0.8rem] font-medium"
					class:accent-bg={settings.startOfWeek === opt.id}
					class:sunken={settings.startOfWeek !== opt.id}
				>
					{opt.label}
				</button>
			{/each}
		</div>
	</section>

	<section class="mb-6">
		<h2 class="dim mb-2 text-[0.7rem] font-semibold tracking-wide uppercase">Sync</h2>
		<div class="raised hairline rounded-2xl border">
			<label class="hairline flex items-center justify-between gap-3 border-b px-4 py-3">
				<span class="text-sm">Sync with server</span>
				<input
					type="checkbox"
					checked={settings.syncEnabled}
					onchange={(e) => {
						setSyncEnabled(e.currentTarget.checked);
						restartSync();
					}}
					class="size-5 accent-current"
				/>
			</label>
			<div class="hairline border-b px-4 py-3">
				<p class="dim mb-1.5 text-[0.7rem]">Server URL</p>
				<div class="flex gap-2">
					<input
						bind:value={serverDraft}
						placeholder="/sync"
						class="sunken min-w-0 flex-1 rounded-xl px-3 py-2 text-sm outline-none"
					/>
					<button
						type="button"
						onclick={applyServer}
						class="tap accent-bg rounded-xl px-4 text-sm font-semibold"
					>
						Apply
					</button>
				</div>
			</div>
			<button
				type="button"
				onclick={() => {
					haptic('tap');
					resync();
					notice = 'Requested a fresh pull from the server.';
				}}
				class="tap hairline w-full border-b px-4 py-3 text-left text-sm"
			>
				Force resync
			</button>
			<div class="px-4 py-3 text-[0.7rem]">
				<p class="dim">
					Status: {sync.phase}{sync.message ? ` — ${sync.message}` : ''}
				</p>
				<p class="dim mt-1 break-all">Device ID: {settings.userId}</p>
			</div>
		</div>
	</section>

	<section class="mb-6">
		<h2 class="dim mb-2 text-[0.7rem] font-semibold tracking-wide uppercase">Data</h2>
		<div class="raised hairline rounded-2xl border">
			<div class="hairline flex items-center justify-between border-b px-4 py-3 text-sm">
				<span class="dim">Open tasks</span>
				<span class="tabular-nums">{openTasks.value.length}</span>
			</div>
			<div class="hairline flex items-center justify-between border-b px-4 py-3 text-sm">
				<span class="dim">Habits</span>
				<span class="tabular-nums">{habits.value.length}</span>
			</div>
			<button
				type="button"
				onclick={() => {
					haptic('tap');
					downloadBackup();
				}}
				class="tap hairline w-full border-b px-4 py-3 text-left text-sm"
			>
				Export backup (JSON)
			</button>
			<button
				type="button"
				onclick={() => fileInput?.click()}
				class="tap w-full px-4 py-3 text-left text-sm"
			>
				Import backup
			</button>
			<input
				bind:this={fileInput}
				type="file"
				accept="application/json,.json"
				onchange={onFile}
				class="hidden"
			/>
		</div>
		<p class="dim mt-2 text-[0.68rem]">
			Import merges by record id and never deletes anything already on this device.
		</p>
	</section>

	<section>
		<h2 class="dim mb-2 text-[0.7rem] font-semibold tracking-wide uppercase">Quick add syntax</h2>
		<div class="raised hairline rounded-2xl border px-4 py-3 text-[0.78rem] leading-relaxed">
			<p><code class="accent-fg">today</code>, <code class="accent-fg">tomorrow</code>, <code class="accent-fg">friday</code>, <code class="accent-fg">next mon</code></p>
			<p><code class="accent-fg">in 3 days</code>, <code class="accent-fg">in 2 weeks</code></p>
			<p><code class="accent-fg">5 jan</code>, <code class="accent-fg">jan 5</code>, <code class="accent-fg">25/12</code></p>
			<p><code class="accent-fg">5pm</code>, <code class="accent-fg">at 9</code>, <code class="accent-fg">14:30</code></p>
			<p><code class="accent-fg">p1</code>–<code class="accent-fg">p4</code> priority, <code class="accent-fg">#project</code></p>
		</div>
	</section>
</main>
