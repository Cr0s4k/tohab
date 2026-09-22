<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tick } from 'svelte';
	import { sheet, veil } from '$lib/motion';
	import { lockScroll } from '$lib/scrollLock';

	let {
		open = false,
		covered = false,
		title = '',
		confirmLabel = 'Done',
		showHeader = true,
		showCloseButton = true,
		safeAreaBottom = true,
		focusTarget = 'first',
		onClose,
		onConfirm = onClose,
		children
	}: {
		open?: boolean;
		/** Keep this sheet mounted but inactive while a sibling sheet is above it. */
		covered?: boolean;
		title?: string;
		confirmLabel?: string;
		showHeader?: boolean;
		showCloseButton?: boolean;
		safeAreaBottom?: boolean;
		/** Where focus lands when the sheet opens. The dialog surface is useful for read-heavy sheets. */
		focusTarget?: 'first' | 'dialog';
		onClose: () => void;
		onConfirm?: () => void;
		children: Snippet;
	} = $props();

	let pane = $state<HTMLElement | null>(null);
	const sheetId = $props.id();
	const titleId = `${sheetId}-title`;
	const focusable = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

	function trapFocus(event: KeyboardEvent) {
		if (covered || event.key !== 'Tab' || !pane) return;
		const items = [...pane.querySelectorAll<HTMLElement>(focusable)].filter((item) => item.getClientRects().length > 0 && !item.closest('details:not([open]) > :not(summary)'));
		if (!items.length) {
			event.preventDefault();
			pane.focus();
			return;
		}
		const first = items[0];
		const last = items.at(-1)!;
		if (event.shiftKey && (document.activeElement === first || document.activeElement === pane)) {
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
		const releaseScroll = lockScroll(() => pane);
		let cancelled = false;
		void tick().then(() => {
			if (cancelled || pane?.closest('[inert], [aria-hidden="true"]')) return;
			const target = focusTarget === 'dialog'
				? pane
				: pane?.querySelector<HTMLElement>('[autofocus]') ?? pane?.querySelector<HTMLElement>(focusable);
			(target ?? pane)?.focus();
		});
		return () => {
			cancelled = true;
			releaseScroll();
			// Wait for the underlying sheet to become exposed before restoring focus.
			void tick().then(() => {
				if (previous?.isConnected && !previous.closest('[inert], [aria-hidden="true"]')) previous.focus();
			});
		};
	});
</script>

{#if open}
	<div inert={covered} aria-hidden={covered ? 'true' : undefined} class="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center md:p-8">
		<button type="button" tabindex="-1" aria-label="Close" onclick={onClose} transition:veil class="absolute inset-0 touch-none bg-black/45"></button>
		<div
			bind:this={pane}
			role="dialog"
			aria-modal={covered ? undefined : 'true'}
			aria-labelledby={titleId}
			tabindex="-1"
			onkeydown={trapFocus}
			class="sheet-dialog raised hairline relative max-h-[88dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl md:max-h-[80dvh] md:max-w-lg md:rounded-3xl md:border md:shadow-2xl"
			class:pb-safe={safeAreaBottom}
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
			<div class={showHeader ? 'px-4 py-4' : showCloseButton ? 'px-4 pt-14 pb-0' : 'px-4 pt-4 pb-0 md:pb-4'}>{@render children()}</div>
		</div>
	</div>
{/if}

<svelte:window onkeydown={(event) => { if (open && !covered && !event.defaultPrevented && event.key === 'Escape') { event.preventDefault(); onClose(); } }} />

<style>
	/* The dialog surface is a focus landing point, not an action. Interactive controls retain their rings. */
	.sheet-dialog:focus {
		outline: none;
	}
</style>
