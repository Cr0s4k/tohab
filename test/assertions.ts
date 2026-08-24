export function createReporter() {
	let failures = 0;

	function check(label: string, got: unknown, want: unknown) {
		const actual = JSON.stringify(got);
		const expected = JSON.stringify(want);
		if (actual === expected) {
			console.log(`ok    ${label} = ${actual}`);
			return;
		}
		failures++;
		console.log(`FAIL  ${label}\n        want ${expected}\n        got  ${actual}`);
	}

	function fail(error: unknown) {
		failures++;
		console.log(`FAIL  ${error instanceof Error ? error.message : error}`);
	}

	function finish(success = 'all passing') {
		console.log(failures ? `\n${failures} failing` : `\n${success}`);
		if (failures) process.exitCode = 1;
	}

	return { check, eq: check, fail, finish, get failures() { return failures; } };
}
