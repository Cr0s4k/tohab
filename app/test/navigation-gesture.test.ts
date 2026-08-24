import { readFileSync } from 'node:fs';
import { createReporter } from '../../test/assertions.ts';

const reporter = createReporter();
const check = reporter.check;

const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
const mainRule = css.match(/^\s*main\s*\{([^}]*)\}/m)?.[1] ?? '';

check(
	'main scroller disables horizontal overscroll navigation',
	/overscroll-behavior-x\s*:\s*none\s*;/.test(mainRule),
	true
);

reporter.finish('Navigation gesture assertions passed');
