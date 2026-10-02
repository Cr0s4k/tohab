import { browser } from '$app/env';

/** Matches the `md` breakpoint the desktop layout switches at. */
export function isDesktop(): boolean {
	return browser && matchMedia('(min-width: 768px)').matches;
}
