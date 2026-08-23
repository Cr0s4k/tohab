import { getDb } from './activity-e2e-db.ts';
import { createTask } from '../src/lib/tasks.ts';
import { arrangeTasks } from '../src/lib/arrange.ts';
import { defaultOptions } from '../src/lib/viewOptions.ts';

let failures = 0;
function eq(label: string, got: unknown, want: unknown) {
	if (JSON.stringify(got) === JSON.stringify(want)) {
		console.log(`ok    ${label}`);
		return;
	}
	failures++;
	console.log(`FAIL  ${label}: want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}

const db = await getDb();
const parent = await createTask({ title: 'Parent task' });
const child = await createTask({ title: 'Child task', parentId: parent!.id });
const rxDocuments = await db.tasks.find({ sort: [{ createdAt: 'asc' }] }).exec();
const arranged = arrangeTasks(rxDocuments, defaultOptions(''))[0].tasks;

eq(
	'arranging real RxDB documents preserves task fields and hierarchy depth',
	arranged.map((task) => [task.id, task.title, task.depth]),
	[
		[parent!.id, 'Parent task', 0],
		[child!.id, 'Child task', 1]
	]
);
eq('arranged child keeps its parentId', arranged[1]?.parentId, parent!.id);

await db.remove();
console.log(failures ? `\n${failures} failing` : '\nall RxDocument arrangement checks passed');
process.exit(failures ? 1 : 0);
