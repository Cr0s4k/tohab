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
 * iOS has no navigator.vibrate, but toggling a `switch` checkbox through its label plays the
 * system haptic. The control has to stay hittable, so it is parked off-screen rather than hidden.
 */
function switchLabel(): HTMLLabelElement | null {
	if (!browser || !CSS.supports('selector(input[switch])')) return null;
	if (label) return label;

	const input = document.createElement('input');
	input.type = 'checkbox';
	input.setAttribute('switch', '');
	input.id = 'haptic-switch';
	input.tabIndex = -1;
	input.setAttribute('aria-hidden', 'true');

	label = document.createElement('label');
	label.htmlFor = input.id;
	label.setAttribute('aria-hidden', 'true');

	const host = document.createElement('div');
	host.style.cssText =
		'position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
	host.append(input, label);
	document.body.append(host);
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
