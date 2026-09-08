<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tick } from 'svelte';
	import { sheet, veil } from '$lib/motion';
	import { lockScroll, unlockScroll } from '$lib/scrollLock';

	let {
		open = false,
		title = '',
		confirmLabel = 'Done',
		showHeader = true,
		showCloseButton = true,
		onClose,
		onConfirm = onClose,
		children
	}: {
		open?: boolean;
		title?: string;
		confirmLabel?: string;
		showHeader?: boolean;
		showCloseButton?: boolean;
		onClose: () => void;
		onConfirm?: () => void;
		children: Snippet;
	} = $props();

	let pane = $state<HTMLElement | null>(null);
	// Only one sheet is exposed at a time; a deterministic id avoids SSR hydration drift.
	const titleId = 'active-sheet-title';
	const focusable = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

	function trapFocus(event: KeyboardEvent) {
		if (event.key !== 'Tab' || !pane) return;
		const items = [...pane.querySelectorAll<HTMLElement>(focusable)].filter((item) => !item.hidden);
		if (!items.length) {
			event.preventDefault();
			pane.focus();
			return;
		}
		const first = items[0];
		const last = items.at(-1)!;
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	$effect(() => {
		if (!open) return;
		const previous = document.activeElement as HTMLElement | null;
		lockScroll(() => pane);
		void tick().then(() => {
			const target = pane?.querySelector<HTMLElement>('[autofocus]') ?? pane?.querySelector<HTMLElement>(focusable);
			(target ?? pane)?.focus();
		});
		return () => {
			unlockScroll();
			if (previous?.isConnected) previous.focus();
		};
	});
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center md:p-8">
		<button type="button" tabindex="-1" aria-label="Close" onclick={onClose} transition:veil class="absolute inset-0 touch-none bg-black/45"></button>
		<div
			bind:this={pane}
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
			tabindex="-1"
			onkeydown={trapFocus}
			class="raised hairline relative max-h-[88dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl pb-safe md:max-h-[80dvh] md:max-w-lg md:rounded-3xl md:border md:shadow-2xl"
			transition:sheet
		>
			{#if showHeader}
				<div class="hairline raised sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3">
					<h2 id={titleId} class="text-subtitle font-semibold">{title || 'Dialog'}</h2>
					<button type="button" onclick={onConfirm} class="tap accent-fg min-h-11 min-w-11 px-2 text-copy font-medium">{confirmLabel}</button>
				</div>
			{:else}
				<h2 id={titleId} class="sr-only">{title || 'Dialog'}</h2>
				{#if showCloseButton}
				<button type="button" aria-label="Close dialog" onclick={onClose} class="tap raised absolute top-2 right-2 z-20 flex min-h-11 min-w-11 items-center justify-center rounded-full text-xl" title="Close">×</button>
				{/if}
			{/if}
			<div class={showHeader ? 'px-4 py-4' : showCloseButton ? 'px-4 pt-14 pb-0' : 'px-4 pt-4 pb-0'}>{@render children()}</div>
		</div>
	</div>
{/if}

<svelte:window onkeydown={(event) => { if (open && event.key === 'Escape') onClose(); }} />
