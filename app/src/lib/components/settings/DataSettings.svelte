<script lang="ts">
	import { downloadBackup, importBackup } from '$lib/backup';
	import { removeDb } from '$lib/db/lazy';
	import { live } from '$lib/db/live.svelte';
	import { stopSync } from '$lib/db/replication.svelte';
	import { habitsQuery } from '$lib/habits';
	import { haptic, hapticTap } from '$lib/haptics';
	import { rx } from '$lib/rx.svelte';
	import { openTasksQuery } from '$lib/tasks';
	import { importTodoistCsv } from '$lib/todoist';

	let { onNotice }: { onNotice: (message: string) => void } = $props();
	let fileInput: HTMLInputElement | null = $state(null);
	let todoistInput: HTMLInputElement | null = $state(null);
	let confirmReset = $state(false);
	let habits = rx(() => (live.db ? habitsQuery(live.db, true).$ : null), []);
	let openTasks = rx(() => (live.db ? openTasksQuery(live.db).$ : null), []);

	async function onFile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const result = await importBackup(await file.text());
			onNotice(`Imported ${result.imported} records${result.skipped ? `, skipped ${result.skipped}` : ''}.`);
			haptic('success');
		} catch (error) {
			onNotice(error instanceof Error ? error.message : 'Import failed.');
			haptic('warn');
		}
		if (fileInput) fileInput.value = '';
	}

	async function onTodoistFile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const result = await importTodoistCsv(await file.text());
			onNotice(`Imported ${result.imported} Todoist tasks${result.skipped ? `, skipped ${result.skipped}` : ''}.`);
			haptic('success');
		} catch (error) {
			onNotice(error instanceof Error ? error.message : 'Todoist import failed.');
			haptic('warn');
		}
		if (todoistInput) todoistInput.value = '';
	}

	async function resetLocalData() {
		if (!confirmReset) {
			confirmReset = true;
			onNotice('Tap again to confirm — this clears this device’s local copy.');
			return;
		}
		confirmReset = false;
		await stopSync();
		await removeDb();
		location.reload();
	}
</script>

<section class="mb-6">
	<h2 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">Data</h2>
	<div class="raised hairline rounded-2xl border">
		<div class="hairline flex items-center justify-between border-b px-4 py-3 text-sm"><span class="dim">Open tasks</span><span class="tabular-nums">{openTasks.value.length}</span></div>
		<div class="hairline flex items-center justify-between border-b px-4 py-3 text-sm"><span class="dim">Habits</span><span class="tabular-nums">{habits.value.length}</span></div>
		<button type="button" use:hapticTap onclick={() => { haptic('tap'); downloadBackup(); }} class="tap hairline w-full border-b px-4 py-3 text-left text-sm">Export backup (JSON)</button>
		<button type="button" onclick={() => fileInput?.click()} class="tap w-full px-4 py-3 text-left text-sm">Import backup</button>
		<button type="button" onclick={() => todoistInput?.click()} class="tap hairline w-full border-t px-4 py-3 text-left text-sm">Import Todoist CSV</button>
		<input bind:this={fileInput} type="file" accept="application/json,.json" onchange={onFile} class="hidden" />
		<input bind:this={todoistInput} type="file" accept=".csv,text/csv" onchange={onTodoistFile} class="hidden" />
	</div>
	<p class="dim mt-2 text-caption">JSON import merges by record id. Todoist import adds tasks to your inbox, preserves subtasks and comments, keeps recurring-date rules, and skips projects and sections.</p>
</section>

<section>
	<h2 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">Quick add syntax</h2>
	<div class="raised hairline rounded-2xl border px-4 py-3 text-[0.78rem] leading-relaxed">
		<p><code class="accent-fg">today</code>, <code class="accent-fg">tomorrow</code>, <code class="accent-fg">friday</code>, <code class="accent-fg">next mon</code></p>
		<p><code class="accent-fg">in 3 days</code>, <code class="accent-fg">in 2 weeks</code></p>
		<p><code class="accent-fg">5 jan</code>, <code class="accent-fg">jan 5</code>, <code class="accent-fg">25/12</code></p>
		<p><code class="accent-fg">5pm</code>, <code class="accent-fg">at 9</code>, <code class="accent-fg">14:30</code></p>
		<p><code class="accent-fg">every day</code>, <code class="accent-fg">every other friday</code>, <code class="accent-fg">every 15th</code></p>
		<p><code class="accent-fg">p1</code>–<code class="accent-fg">p4</code> or <code class="accent-fg">!!1</code>–<code class="accent-fg">!!4</code> priority, <code class="accent-fg">#project</code></p>
	</div>
</section>

<section>
	<h2 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">Developer</h2>
	<div class="raised hairline rounded-2xl border">
		<button type="button" use:hapticTap onclick={() => { haptic('tap'); void resetLocalData(); }} class="tap w-full px-4 py-3 text-left text-sm" class:danger={confirmReset}>{confirmReset ? 'Tap again to confirm reset' : 'Reset local data'}</button>
	</div>
	<p class="dim mt-2 text-caption">Clears this device’s local database and re-syncs from the server. Recoverable when a schema change leaves the local store unreadable.</p>
</section>
