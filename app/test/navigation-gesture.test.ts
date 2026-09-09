import { readFileSync } from 'node:fs';
import { createReporter } from '../../test/assertions.ts';
import { preventEdgeNavigation } from '../src/lib/navigationGestures.ts';

const reporter = createReporter();
const check = reporter.check;

const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
const mainRule = css.match(/^\s*main\s*\{([^}]*)\}/m)?.[1] ?? '';

check(
	'main scroller disables horizontal overscroll navigation',
	/overscroll-behavior-x\s*:\s*none\s*;/.test(mainRule),
	true
);

for (const [label, positions, cancelable, expected] of [
	['left edge blocks history swipe', [8], true, true],
	['right edge blocks history swipe', [386], true, true],
	['content keeps scrolling and row gestures', [190], true, false],
	['multitouch keeps pinch zoom', [8, 190], true, false],
	['noncancelable events are ignored', [8], false, false],
] as const) {
	let prevented = false;
	preventEdgeNavigation({
		cancelable,
		touches: positions.map((clientX) => ({ clientX })),
		preventDefault: () => { prevented = true; },
	} as unknown as TouchEvent, 390);
	check(label, prevented, expected);
}

reporter.finish('Navigation gesture assertions passed');
