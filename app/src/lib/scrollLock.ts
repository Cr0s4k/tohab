let depth = 0;

/** The scroller is `main`, not the document, so the lock is a root attribute the stylesheet acts on. */
export function lockScroll() {
	if (++depth === 1) document.documentElement.setAttribute('data-scroll-locked', '');
}

export function unlockScroll() {
	if (depth > 0 && --depth === 0) document.documentElement.removeAttribute('data-scroll-locked');
}
