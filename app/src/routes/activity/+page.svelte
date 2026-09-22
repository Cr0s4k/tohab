<script lang="ts">
	import { live } from '$lib/db/live.svelte';
	import { rx } from '$lib/rx.svelte';
	import type { Activity } from '$lib/db/schemas';
	import {
		activityQuery,
		activityTime,
		activityTitle,
		activityTone,
		clearActivity,
		groupActivity
	} from '$lib/activity';
	import { haptic, hapticTap } from '$lib/haptics';
	import { collapse } from '$lib/motion';
	import DataError from '$lib/components/DataError.svelte';
	import { reportActionError } from '$lib/actionError.svelte';

	let confirmingClear = $state(false);

	let entries = rx<Activity[]>(() => (live.db ? activityQuery(live.db).$ : null), []);
	let groups = $derived(groupActivity(entries.value));
	let queryError = $derived(entries.error);

	function retryQuery() {
		entries.retry?.();
	}

	const TONE_COLORS = {
		destructive: 'var(--danger)',
		positive: 'var(--positive)',
		neutral: 'var(--text-faint)'
	};


	async function clearAll() {
		const clear = async () => {
			await clearActivity();
			confirmingClear = false;
			haptic('success');
		};
		try {
			await clear();
		} catch (caught) {
			reportActionError(caught, clear);
		}
	}
</script>

<header class="hairline z-20 shrink-0 border-b pt-safe">
	<div class="measure-gutter flex items-center gap-3 px-4 pt-2 pb-3">
		<a
			href="/browse"
			use:hapticTap
			onclick={() => haptic('tap')}
			aria-label="Back"
			class="tap dim -ml-1 p-1"
		>
			<svg
				viewBox="0 0 24 24"
				class="size-6"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M15 19l-7-7 7-7" />
			</svg>
		</a>
		<h1 class="min-w-0 flex-1 truncate text-header md:text-header-large font-bold tracking-tight">
			Activity
		</h1>
		{#if entries.value.length}
			<button
				type="button"
				use:hapticTap
				onclick={() => {
					haptic('tap');
					confirmingClear = !confirmingClear;
				}}
				class="tap dim shrink-0 p-1 text-sm font-medium"
			>
				Clear
			</button>
		{/if}
	</div>
</header>

<main class="flex-1 overflow-y-auto pb-20">
	{#if queryError}<DataError label="activity" onRetry={retryQuery} />{/if}
	{#if confirmingClear}
		<div transition:collapse class="hairline raised border-b px-4 py-3">
			<div class="measure flex items-center gap-3">
				<p class="dim min-w-0 flex-1 text-sm">
					Clear the history? Your tasks and habits are not touched.
				</p>
				<button
					type="button"
					use:hapticTap
					onclick={clearAll}
					class="tap danger-bg shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold"
				>
					Clear
				</button>
				<button
					type="button"
					onclick={() => (confirmingClear = false)}
					class="tap sunken shrink-0 rounded-xl px-3 py-1.5 text-sm font-medium"
				>
					Cancel
				</button>
			</div>
		</div>
	{/if}

	{#if entries.loading}
		<p class="dim measure px-8 py-14 text-center text-sm">Loading…</p>
	{:else if !groups.length}
		<p class="dim measure px-8 py-14 text-center text-sm">
			Nothing yet. Changes you make to tasks and habits show up here so you can look back.
		</p>
	{:else}
		{#each groups as group (group.key)}
			<section>
				<div class="surface sticky top-0 z-10 px-4 pt-3 pb-0">
					<h2
						class="hairline measure border-b pb-1.5 text-caption font-semibold tracking-wide uppercase"
					>
						{group.label}
					</h2>
				</div>

				{#each group.entries as entry (entry.id)}
					<div transition:collapse class="surface px-4 pt-3.5 pb-0">
						<div class="hairline measure flex items-start gap-3 border-b pb-3.5">
							<span
								class="mt-1.5 size-2 shrink-0 rounded-full"
								style="background: {TONE_COLORS[activityTone(entry)]}"
							></span>

							<div class="min-w-0 flex-1">
								<p class="text-body" class:line-through={entry.revertedAt !== 0}>
									<span class="font-medium">{activityTitle(entry)}</span>
									{#if entry.subject}
										<span class="dim">— {entry.subject}</span>
									{/if}
								</p>
								<p class="faint mt-0.5 text-caption">
									{activityTime(entry.at)}{#if entry.detail}
										· {entry.detail}{/if}{#if entry.revertedAt !== 0}
										· undone{/if}
								</p>
							</div>
						</div>
					</div>
				{/each}
			</section>
		{/each}

		<p class="dim measure px-4 py-4 text-caption">
			The last 200 changes, on every device you sync.
		</p>
	{/if}
</main>
