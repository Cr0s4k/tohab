import { browser } from '$app/environment';

type Pattern = 'tap' | 'success' | 'warn';

const patterns: Record<Pattern, number | number[]> = {
	tap: 10,
	success: [12, 40, 24],
	warn: [30, 60, 30]
};

const bumps: Record<Pattern, number> = { tap: 1, success: 2, warn: 3 };

let label: HTMLLabelElement | null = null;

/**
 * iOS has no navigator.vibrate, but clicking a label that wraps a `switch` checkbox plays the
 * system haptic. The input has to be a real descendant of the label — a `for` reference or a
 * container with `pointer-events: none` stops the haptic from firing.
 */
function switchLabel(): HTMLLabelElement | null {
	if (!browser) return null;
	if (label) return label;

	const input = document.createElement('input');
	input.type = 'checkbox';
	input.setAttribute('switch', '');
	input.tabIndex = -1;

	label = document.createElement('label');
	label.setAttribute('aria-hidden', 'true');
	label.style.display = 'none';
	label.append(input);
	document.head.append(label);
	return label;
}

export function haptic(pattern: Pattern = 'tap') {
	try {
		if (navigator.vibrate) {
			navigator.vibrate(patterns[pattern]);
			return;
		}
		const target = switchLabel();
		if (!target) return;
		target.click();
		for (let i = 1; i < bumps[pattern]; i++) setTimeout(() => target.click(), i * 60);
	} catch {
		/* unsupported */
	}
}
