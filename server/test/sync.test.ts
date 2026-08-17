const BASE = process.env.BASE ?? 'http://localhost:5178/sync';
const USER = `test-${process.pid}`;

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

const headers = { 'content-type': 'application/json', 'x-user-id': USER };

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

async function pull(cursor = 0, id = '', limit = 100, collection = 'tasks') {
	const q = new URLSearchParams({ collection, cursor: String(cursor), id, limit: String(limit) });
	const res = await fetch(`${BASE}/pull?${q}`, { headers });
	return res.json() as Promise<{ documents: any[]; checkpoint: { cursor: number; id: string } }>;
}

async function push(rows: unknown[], collection = 'tasks') {
	const res = await fetch(`${BASE}/push`, {
		method: 'POST',
		headers,
		body: JSON.stringify({ collection, rows })
	});
	return res.json() as Promise<any[]>;
}

// 1. A fresh user pulls nothing.
check('empty pull', await pull(), { documents: [], checkpoint: { cursor: 0, id: '' } });

// 2. Two inserts, no conflicts.
check('insert two', await push([{ newDocumentState: task('t1', 100) }, { newDocumentState: task('t2', 101) }]), []);

const after = await pull();
check('pull sees both', after.documents.map((d) => d.id).sort(), ['t1', 't2']);
check('checkpoint advanced', after.checkpoint.cursor > 0, true);

// 3. A stale assumedMasterState must be rejected and return the master doc.
const stale = await push([
	{ assumedMasterState: task('t1', 99), newDocumentState: task('t1', 200, { title: 'stale' }) }
]);
check('stale push conflicts', stale.map((d) => [d.id, d.updatedAt]), [['t1', 100]]);
check(
	'conflicted doc not written',
	(await pull()).documents.find((d) => d.id === 't1').title,
	't1'
);

// 4. A correct assumedMasterState wins.
check(
	'fresh push accepted',
	await push([
		{ assumedMasterState: task('t1', 100), newDocumentState: task('t1', 300, { title: 'updated', done: true }) }
	]),
	[]
);
check('update applied', (await pull()).documents.find((d) => d.id === 't1').title, 'updated');

// 5. Missing assumedMasterState on an existing doc is a conflict, not a blind overwrite.
check(
	'blind insert over existing conflicts',
	(await push([{ newDocumentState: task('t1', 999, { title: 'blind' }) }])).map((d) => d.id),
	['t1']
);

// 6. Incremental pull from a checkpoint returns only what changed after it.
const cp = (await pull()).checkpoint;
await push([{ assumedMasterState: task('t2', 101), newDocumentState: task('t2', 400, { title: 'later' }) }]);
const delta = await pull(cp.cursor, cp.id);
check('incremental pull is a delta', delta.documents.map((d) => d.id), ['t2']);
check('delta carries the new value', delta.documents[0].title, 'later');

// 7. Deletes travel as tombstones so other devices learn about them.
await push([
	{ assumedMasterState: task('t2', 400, { title: 'later' }), newDocumentState: task('t2', 500, { _deleted: true }) }
]);
const withTombstone = await pull();
check(
	'tombstone is replicated',
	withTombstone.documents.find((d) => d.id === 't2')._deleted,
	true
);

// 8. Paging respects the limit and the cursor is stable across pages.
await push(Array.from({ length: 5 }, (_, i) => ({ newDocumentState: task(`p${i}`, 600 + i) })));
const page1 = await pull(0, '', 3);
check('page 1 size', page1.documents.length, 3);
const page2 = await pull(page1.checkpoint.cursor, page1.checkpoint.id, 3);
check('page 2 does not repeat page 1', page2.documents.some((d) => page1.documents.some((p) => p.id === d.id)), false);

// 9. Collections are isolated from each other.
await push([{ newDocumentState: { id: 'h1', name: 'Water', updatedAt: 700, _deleted: false } }], 'habits');
check('habits are a separate stream', (await pull(0, '', 100, 'habits')).documents.map((d) => d.id), ['h1']);
check('tasks unaffected', (await pull(0, '', 100)).documents.some((d) => d.id === 'h1'), false);

// 10. Unknown collections are rejected rather than silently stored.
const bad = await fetch(`${BASE}/pull?collection=evil`, { headers });
check('unknown collection rejected', bad.status, 400);

// 11. Users cannot see each other's documents.
const other = await fetch(`${BASE}/pull?collection=tasks&cursor=0&id=&limit=100`, {
	headers: { ...headers, 'x-user-id': `${USER}-other` }
});
check('user isolation', (await other.json()).documents, []);

// 12. The server stamps its own received_at, independent of client clocks.
const beforeWrite = Date.now();
await push([{ newDocumentState: task('stamp1', 1) }]); // client claims updatedAt = 1
const status = await (await fetch(`${BASE}/status`, { headers })).json();
const tasksRow = status.collections.find((r: any) => r.collection === 'tasks');
check('status reports a server received_at', tasksRow.lastReceivedAt >= beforeWrite, true);
check(
	'received_at ignores the absurd client timestamp',
	tasksRow.lastReceivedAt > 1_600_000_000_000,
	true
);
check('status reports server time', typeof status.serverTime, 'number');

// 13. A client clock stuck in 1970 is reported as skew rather than silently trusted.
const skew = status.clockSkew.find((r: any) => r.collection === 'tasks');
check('clock skew is surfaced', skew.skewMs < 0, true);

// 14. The client's own updatedAt still round-trips untouched as document data.
check(
	'client updatedAt is preserved as data',
	(await pull()).documents.find((d) => d.id === 'stamp1').updatedAt,
	1
);

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
