let depth = 0;
let release: (() => void) | null = null;

function scrollableWithin(target: Node, pane: HTMLElement) {
	let el: HTMLElement | null =
		target instanceof HTMLElement ? target : (target.parentElement as HTMLElement | null);
	while (el) {
		const style = getComputedStyle(el);
		const scrolls =
			(/auto|scroll/.test(style.overflowY) && el.scrollHeight > el.clientHeight) ||
			(/auto|scroll/.test(style.overflowX) && el.scrollWidth > el.clientWidth);
		if (scrolls) return true;
		if (el === pane) return false;
		el = el.parentElement;
	}
	return false;
}

/**
 * Two layers, because neither is enough alone: the attribute lets the stylesheet freeze `main`
 * (the app's real scroller — the document itself never scrolls), and the touchmove guard is what
 * stops iOS from panning the page anyway on gestures that never reach a scroller — the veil, the
 * sheet's own padding, a swipe past the end of its list.
 */
export function lockScroll(allow?: () => HTMLElement | null | undefined) {
	if (++depth > 1) return;
	document.documentElement.setAttribute('data-scroll-locked', '');

	const onTouchMove = (event: TouchEvent) => {
		if (event.touches.length > 1 || event.defaultPrevented) return;
		const pane = allow?.();
		if (pane && event.target instanceof Node && pane.contains(event.target)) {
			if (scrollableWithin(event.target, pane)) return;
		}
		event.preventDefault();
	};

	document.addEventListener('touchmove', onTouchMove, { passive: false });
	release = () => document.removeEventListener('touchmove', onTouchMove);
}

export function unlockScroll() {
	if (depth === 0 || --depth > 0) return;
	document.documentElement.removeAttribute('data-scroll-locked');
	release?.();
	release = null;
}
