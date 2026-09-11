const locks: { allow?: () => HTMLElement | null | undefined }[] = [];
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
	const lock = { allow };
	locks.push(lock);
	if (locks.length === 1) installScrollLock();
	return () => {
		const index = locks.indexOf(lock);
		if (index === -1) return;
		locks.splice(index, 1);
		if (locks.length) return;
		document.documentElement.removeAttribute('data-scroll-locked');
		release?.();
		release = null;
	};
}

function installScrollLock() {
	document.documentElement.setAttribute('data-scroll-locked', '');

	const onTouchMove = (event: TouchEvent) => {
		if (event.touches.length > 1 || event.defaultPrevented) return;
		// Only a visible top sheet may scroll while the background and covered sheets stay locked.
		if (!(event.target instanceof Node)) {
			event.preventDefault();
			return;
		}
		const target = event.target;
		const pane = [...locks]
			.reverse()
			.map(({ allow }) => allow?.())
			.find((candidate) => candidate && !candidate.closest('[inert], [aria-hidden="true"]') && candidate.contains(target));
		if (pane && scrollableWithin(target, pane)) return;
		event.preventDefault();
	};

	document.addEventListener('touchmove', onTouchMove, { passive: false });
	release = () => document.removeEventListener('touchmove', onTouchMove);
}
