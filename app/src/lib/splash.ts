/**
 * The splash lives in app.html so it paints before the bundle loads; only the app knows when
 * the store behind it is actually usable, so tearing it down is done from here.
 */
export function hideSplash() {
	const el = document.getElementById('splash');
	if (!el || el.dataset.leaving) return;
	el.dataset.leaving = '';
	el.addEventListener('transitionend', () => el.remove(), { once: true });
	setTimeout(() => el.remove(), 600);
}
