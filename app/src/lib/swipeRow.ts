import interact from 'interactjs';
import { isDesktop } from './viewport';

type SwipeCallbacks = {
	move: (offset: number) => void;
	release: (offset: number) => void;
	cancel: () => void;
	destroy: () => void;
};

/** Interact owns pointer tracking and drag lifetime; Svelte owns rendering and actions. */
export function swipeRow(node: HTMLElement, callbacks: SwipeCallbacks) {
	let stopInteraction: (() => void) | undefined;
	let scrollIntent = false;
	let offset = 0;
	let start: { x: number; y: number } | undefined;
	const target = interact(node).styleCursor(false).preventDefault('never');
	target.draggable({
		manualStart: true,
		lockAxis: 'x',
		inertia: false,
		listeners: {
			move(event) {
				offset = event.clientX - event.clientX0;
				callbacks.move(offset);
			},
			end(event) {
				start = undefined;
				stopInteraction = undefined;
				callbacks.release(event.clientX - event.clientX0);
			}
		}
	});
	target.on('down', (event) => {
		if (start) {
			stopInteraction?.();
			scrollIntent = true;
			event.interaction.stop();
			callbacks.cancel();
			return;
		}
		stopInteraction = () => event.interaction.stop();
		start = { x: event.clientX, y: event.clientY };
		scrollIntent = isDesktop() || (event.pointerType === 'mouse' && event.button !== 0);
		offset = 0;
	});
	target.on('move', (event) => {
		const interaction = event.interaction;
		if (!start || scrollIntent || !interaction.pointerIsDown || interaction.interacting()) return;
		const dx = event.clientX - start.x;
		const dy = event.clientY - start.y;
		// Once scrolling wins, a later sideways movement must never delete a task.
		if (Math.abs(dy) >= 10 && Math.abs(dx) < Math.abs(dy) * 2) {
			scrollIntent = true;
		} else if (Math.abs(dx) >= 10 && Math.abs(dx) >= Math.abs(dy) * 2) {
			interaction.start({ name: 'drag', axis: 'x' }, target, node);
			offset = dx;
			callbacks.move(offset);
		}
	});
	const clearStart = () => { start = undefined; };
	target.on('up', clearStart);
	// Releases outside the row must also clear pre-drag intent.
	window.addEventListener('pointerup', clearStart);
	window.addEventListener('pointercancel', clearStart);
	target.on('cancel', (event) => {
		start = undefined;
		scrollIntent = true;
		event.interaction.stop();
		callbacks.cancel();
	});
	const blur = () => {
		stopInteraction?.();
		stopInteraction = undefined;
		start = undefined;
		scrollIntent = true;
		callbacks.cancel();
	};
	// Capture runs before Interact's window-blur handler can end a drag as a release.
	window.addEventListener('blur', blur, true);
	return {
		update(next: SwipeCallbacks) { callbacks = next; },
		destroy() {
			window.removeEventListener('blur', blur, true);
			window.removeEventListener('pointerup', clearStart);
			window.removeEventListener('pointercancel', clearStart);
			target.unset();
			callbacks.destroy();
		}
	};
}
