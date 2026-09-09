/** Cancel activation after a drag, including clicks forwarded by the iOS haptic overlay. */
export function scrollTap(node: HTMLElement) {
	let start: { id: number; x: number; y: number } | undefined;
	let cancelled = false;
	const down = (event: PointerEvent) => {
		if (start) { cancelled = true; return; }
		start = { id: event.pointerId, x: event.clientX, y: event.clientY };
		cancelled = false;
	};
	const move = (event: PointerEvent) => {
		if (!start || event.pointerId !== start.id) return;
		if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancelled = true;
	};
	const up = (event: PointerEvent) => {
		move(event);
		if (event.pointerId === start?.id) start = undefined;
	};
	const cancel = (event: PointerEvent) => {
		if (event.pointerId !== start?.id) return;
		cancelled = true;
		start = undefined;
	};
	const click = (event: MouseEvent) => {
		// Keyboard and assistive activation have no pointer click count.
		if (!cancelled || event.detail === 0) return;
		event.preventDefault();
		event.stopImmediatePropagation();
	};
	node.addEventListener('pointerdown', down, true);
	window.addEventListener('pointermove', move, true);
	window.addEventListener('pointerup', up, true);
	window.addEventListener('pointercancel', cancel, true);
	node.addEventListener('click', click, true);
	return { destroy() {
		node.removeEventListener('pointerdown', down, true);
		window.removeEventListener('pointermove', move, true);
		window.removeEventListener('pointerup', up, true);
		window.removeEventListener('pointercancel', cancel, true);
		node.removeEventListener('click', click, true);
	} };
}
