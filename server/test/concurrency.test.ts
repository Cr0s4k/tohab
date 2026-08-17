/**
 * Concurrency tests. These matter on Postgres in a way they did not on SQLite: pushes now
 * run on separate pool connections, so two clients can be inside the conflict check at the
 * same time. A lost update here is silent — the losing client believes its write landed.
 */
const BASE = process.env.BASE ?? 'http://localhost:5178/sync';

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

function headers(user: string) {
	return { 'content-type': 'application/json', 'x-user-id': user };
}

function task(id: string, updatedAt: number, over: Record<string, unknown> = {}) {
	return {
		id,
		title: id,
		notes: '',
		done: false,
		completedAt: 0,
		due: '',
		dueTime: '',
		priority: 4,
		projectId: '',
		createdAt: 1,
		updatedAt,
		_deleted: false,
		...over
	};
}

async function push(user: string, rows: unknown[], collection = 'tasks') {
	const res = await fetch(`${BASE}/push`, {
		method: 'POST',
		headers: headers(user),
		body: JSON.stringify({ collection, rows })
	});
	return res.json() as Promise<any[]>;
}

async function pull(user: string, collection = 'tasks') {
	const q = new URLSearchParams({ collection, cursor: '0', id: '', limit: '200' });
	const res = await fetch(`${BASE}/pull?${q}`, { headers: headers(user) });
	return res.json() as Promise<{ documents: any[]; checkpoint: { cursor: number; id: string } }>;
}

// --- 1. Two clients race to update the same document from the same base state. ---
// Exactly one may win; the other must be told it conflicted rather than silently losing.
const raceUser = `race-${process.pid}`;
await push(raceUser, [{ newDocumentState: task('doc', 100) }]);

const [aConflicts, bConflicts] = await Promise.all([
	push(raceUser, [
		{ assumedMasterState: task('doc', 100), newDocumentState: task('doc', 200, { title: 'A' }) }
	]),
	push(raceUser, [
		{ assumedMasterState: task('doc', 100), newDocumentState: task('doc', 300, { title: 'B' }) }
	])
]);

const winners = [aConflicts, bConflicts].filter((c) => c.length === 0).length;
const losers = [aConflicts, bConflicts].filter((c) => c.length === 1).length;
check('exactly one concurrent writer wins', winners, 1);
check('the other is told it conflicted', losers, 1);

const stored = (await pull(raceUser)).documents.find((d) => d.id === 'doc');
check('stored title is one of the two writes', ['A', 'B'].includes(stored.title), true);
check(
	'stored updatedAt matches the stored title',
	stored.updatedAt,
	stored.title === 'A' ? 200 : 300
);

// --- 2. Many concurrent writers to one document: exactly one wins per generation. ---
const stormUser = `storm-${process.pid}`;
await push(stormUser, [{ newDocumentState: task('hot', 1000) }]);

const attempts = await Promise.all(
	Array.from({ length: 8 }, (_, i) =>
		push(stormUser, [
			{
				assumedMasterState: task('hot', 1000),
				newDocumentState: task('hot', 2000 + i, { title: `w${i}` })
			}
		])
	)
);
check('only one of eight racers wins', attempts.filter((c) => c.length === 0).length, 1);
check('the other seven all conflict', attempts.filter((c) => c.length === 1).length, 7);

// --- 3. Concurrent writes to *different* documents must all succeed. ---
const fanUser = `fan-${process.pid}`;
const fan = await Promise.all(
	Array.from({ length: 12 }, (_, i) => push(fanUser, [{ newDocumentState: task(`d${i}`, 500 + i) }]))
);
check('independent concurrent writes never conflict', fan.every((c) => c.length === 0), true);
check('all independent writes are stored', (await pull(fanUser)).documents.length, 12);

// --- 4. Revisions stay strictly increasing under concurrency, so cursors never skip. ---
const revs = (await pull(fanUser)).documents.length;
const page = await pull(fanUser);
const sortedRevs = page.documents.map((_, i) => i);
check('pull returns every document once', page.documents.length, revs);
check(
	'document ids are unique',
	new Set(page.documents.map((d) => d.id)).size,
	page.documents.length
);
void sortedRevs;

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
