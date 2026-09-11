/** Cancel activation after a drag, including clicks forwarded by the iOS haptic overlay. */
export function scrollTap(node: HTMLElement) {
	let start: { id: number; x: number; y: number } | undefined;
	let cancelled = false;
	let origin: Node | null = null;
	const setCancelled = (value: boolean) => {
		cancelled = value;
		// Native :active can outlive pointer cancellation while the browser scrolls.
		node.toggleAttribute('data-scroll-tap-cancelled', value);
	};
	const down = (event: PointerEvent) => {
		if (start) { setCancelled(true); return; }
		origin = event.target as Node;
		start = { id: event.pointerId, x: event.clientX, y: event.clientY };
		setCancelled(false);
	};
	const move = (event: PointerEvent) => {
		// A fresh mouse hover may restore feedback without re-enabling a cancelled click.
		if (!start && event.pointerType === 'mouse' && event.buttons === 0) {
			node.removeAttribute('data-scroll-tap-cancelled');
		}
		if (!start || event.pointerId !== start.id) return;
		if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) setCancelled(true);
	};
	const up = (event: PointerEvent) => {
		move(event);
		if (event.pointerId === start?.id) {
			start = undefined;
			origin = null;
		}
	};
	const cancel = (event: PointerEvent) => {
		if (event.pointerId !== start?.id) return;
		setCancelled(true);
		start = undefined;
		origin = null;
	};
	const scroll = (event: Event) => {
		// Scroll does not bubble. Watch ancestors in capture, including modal scrollers.
		if (origin && event.target instanceof Node && event.target.contains(origin)) setCancelled(true);
	};
	const keydown = () => { setCancelled(false); origin = null; };
	const click = (event: MouseEvent) => {
		// Label activation can produce a zero-detail click on the iOS haptic input.
		// Only exempt zero-detail activation when it did not come from that overlay
		// or a physical pointer. Keyboard activation clears cancellation above.
		const overlay = event.target instanceof Element && event.target.matches('input[switch]');
		const physical = event.detail > 0 || ('pointerType' in event && Boolean(event.pointerType));
		if (!cancelled || (!physical && !overlay)) return;
		event.preventDefault();
		event.stopImmediatePropagation();
	};
	node.addEventListener('pointerdown', down, true);
	window.addEventListener('pointermove', move, true);
	window.addEventListener('pointerup', up, true);
	window.addEventListener('pointercancel', cancel, true);
	window.addEventListener('scroll', scroll, true);
	node.addEventListener('keydown', keydown, true);
	node.addEventListener('click', click, true);
	return { destroy() {
		node.removeAttribute('data-scroll-tap-cancelled');
		node.removeEventListener('pointerdown', down, true);
		window.removeEventListener('pointermove', move, true);
		window.removeEventListener('pointerup', up, true);
		window.removeEventListener('pointercancel', cancel, true);
		window.removeEventListener('scroll', scroll, true);
		node.removeEventListener('keydown', keydown, true);
		node.removeEventListener('click', click, true);
	} };
}
