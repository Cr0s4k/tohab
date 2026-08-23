import { readFileSync } from 'node:fs';

let failures = 0;
function check(label: string, got: unknown, want: unknown) {
	const a = JSON.stringify(got);
	const b = JSON.stringify(want);
	if (a !== b) {
		failures++;
		console.log(`FAIL  ${label}\n        want ${b}\n        got  ${a}`);
	} else {
		console.log(`ok    ${label}`);
	}
}

const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
const mainRule = css.match(/^\s*main\s*\{([^}]*)\}/m)?.[1] ?? '';

check(
	'main scroller disables horizontal overscroll navigation',
	/overscroll-behavior-x\s*:\s*none\s*;/.test(mainRule),
	true
);

if (failures) {
	console.error(`\n${failures} navigation gesture assertion(s) failed`);
	process.exit(1);
}

console.log('\nNavigation gesture assertions passed');
