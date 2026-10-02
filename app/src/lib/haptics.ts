import { browser } from '$app/env';

type Pattern = 'tap' | 'success' | 'warn';

const patterns: Record<Pattern, number | number[]> = {
	tap: 10,
	success: [12, 40, 24],
	warn: [30, 60, 30]
};

export function haptic(pattern: Pattern = 'tap') {
	if (!browser) return;
	try {
		navigator.vibrate?.(patterns[pattern]);
	} catch {
		/* unsupported */
	}
}

/**
 * iOS has no navigator.vibrate. Toggling a `switch` checkbox plays a system haptic, but only
 * from a genuine tap — a synthetic click is silent — so the control is laid over the host,
 * transparent, to catch the tap itself.
 */
export function hapticTap(node: HTMLElement) {
	if (!browser) return;
	if ('vibrate' in navigator) return;

	const input = document.createElement('input');
	input.type = 'checkbox';
	input.setAttribute('switch', '');
	input.tabIndex = -1;
	input.style.cssText = 'width:100%;height:100%;margin:0;opacity:0';

	const label = document.createElement('label');
	label.setAttribute('aria-hidden', 'true');
	label.style.cssText = 'position:absolute;inset:0;touch-action:manipulation';
	label.append(input);

	input.addEventListener('click', (event) => {
		event.stopPropagation();
		node.click();
	});

	/**
	 * A tap on the label activates the input, which dispatches a second click. The input forwards
	 * that activation to the host so native button submission and link navigation still happen.
	 * The input covers the label, so only the label's own click has to be dropped.
	 */
	label.addEventListener('click', (e) => {
		if (e.target === label) e.stopPropagation();
	});

	if (getComputedStyle(node).position === 'static') node.style.position = 'relative';
	node.append(label);

	return { destroy() { label.remove(); } };
}
