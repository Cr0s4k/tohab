import { getDb } from './activity-e2e-db.ts';
import { createTask } from '../src/lib/tasks.ts';
import { arrangeTasks } from '../src/lib/arrange.ts';
import { defaultOptions } from '../src/lib/viewOptions.ts';
import { createReporter } from '../../test/assertions.ts';

const reporter = createReporter();
const eq = reporter.eq;

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
reporter.finish('all RxDocument arrangement checks passed');
