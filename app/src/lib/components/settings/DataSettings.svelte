<script lang="ts">
	import { downloadBackup, importBackup } from '#lib/backup.js';
	import { live } from '#lib/db/live.svelte.js';
	import { habitsQuery } from '#lib/habits.js';
	import { haptic, hapticTap } from '#lib/haptics.js';
	import { rx } from '#lib/rx.svelte.js';
	import { openTasksQuery } from '#lib/tasks.js';
	import { importTodoistCsv } from '#lib/todoist.js';
	import DataError from '#lib/components/DataError.svelte';

	let { onNotice }: { onNotice: (message: string) => void } = $props();
	let fileInput: HTMLInputElement | null = $state(null);
	let todoistInput: HTMLInputElement | null = $state(null);
	let habits = rx(() => (live.db ? habitsQuery(live.db, true).$ : null), []);
	let openTasks = rx(() => (live.db ? openTasksQuery(live.db).$ : null), []);
	let queryError = $derived(habits.error ?? openTasks.error);

	function retryQueries() {
		habits.retry?.();
		openTasks.retry?.();
	}

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

</script>

<section>
	{#if queryError}<DataError label="data counts" onRetry={retryQueries} />{/if}
	<h3 class="mb-3 text-sm font-semibold">Data</h3>
	<div class="raised hairline rounded-2xl border">
		<div class="hairline flex items-center justify-between border-b px-4 py-3 text-sm"><span class="dim">Open tasks</span><span class="tabular-nums">{openTasks.value.length}</span></div>
		<div class="hairline flex items-center justify-between border-b px-4 py-3 text-sm"><span class="dim">Habits</span><span class="tabular-nums">{habits.value.length}</span></div>
		<button type="button" use:hapticTap onclick={() => { haptic('tap'); downloadBackup(); }} class="tap hairline min-h-11 w-full border-b px-4 py-3 text-left text-sm">Export backup (JSON)</button>
		<button type="button" onclick={() => fileInput?.click()} class="tap min-h-11 w-full px-4 py-3 text-left text-sm">Import backup</button>
		<button type="button" onclick={() => todoistInput?.click()} class="tap hairline min-h-11 w-full border-t px-4 py-3 text-left text-sm">Import Todoist CSV</button>
		<input bind:this={fileInput} type="file" accept="application/json,.json" onchange={onFile} class="hidden" />
		<input bind:this={todoistInput} type="file" accept=".csv,text/csv" onchange={onTodoistFile} class="hidden" />
	</div>
	<p class="dim mt-2 text-caption">JSON import merges by record id. Todoist import adds tasks to your inbox, preserves subtasks and comments, keeps recurring-date rules, and skips projects and sections.</p>
</section>
