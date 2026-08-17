type Pattern = 'tap' | 'success' | 'warn';

const patterns: Record<Pattern, number | number[]> = {
	tap: 10,
	success: [12, 40, 24],
	warn: [30, 60, 30]
};

/**
 * iOS Safari does not implement navigator.vibrate, so this is a no-op there;
 * the CSS `tap` press-state carries the feedback on those devices.
 */
export function haptic(pattern: Pattern = 'tap') {
	try {
		navigator.vibrate?.(patterns[pattern]);
	} catch {
		/* unsupported */
	}
}
