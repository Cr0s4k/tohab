import { getDb } from './activity-e2e-db.ts';
import { createTask, deleteTask } from '../src/lib/tasks.ts';
import { activityQuery, decodeChanges, revertActivity } from '../src/lib/activity.ts';
import { createReporter } from '../../test/assertions.ts';

const reporter = createReporter();
const eq = reporter.eq;

const db = await getDb();
const activity = async () => (await activityQuery(db).exec()).map((entry: any) => entry.toMutableJSON());

async function checkDeletePromotion(
	label: string,
	promotionParentId: (deletedId: string, directChildId: string) => Promise<string> | string,
	expectedPromotedParentId: (originalParentId: string) => string
) {
	const deleted = await createTask({ title: `${label} deleted` });
	const directChild = await createTask({ title: `${label} child`, parentId: deleted!.id });
	const originalParentId = await promotionParentId(deleted!.id, directChild!.id);
	await (await db.tasks.findOne(deleted!.id).exec()).patch({ parentId: originalParentId });

	await deleteTask(deleted!.id);
	const expectedParentId = expectedPromotedParentId(originalParentId);
	eq(`${label} promotes direct child safely`, (await db.tasks.findOne(directChild!.id).exec()).parentId, expectedParentId);

	const deletion = (await activity()).find(
		(entry: any) => entry.entityId === deleted!.id && entry.verb === 'delete' && entry.revertedAt === 0
	);
	const childChange = decodeChanges(deletion.changes).find((change) => change.id === directChild!.id);
	eq(
		`${label} activity records original and promoted relationships`,
		[childChange?.before?.parentId, childChange?.after?.parentId],
		[deleted!.id, expectedParentId]
	);
	eq(`${label} delete activity can be undone`, await revertActivity(deletion.id), true);
	eq(
		`${label} undo restores deleted task parent`,
		(await db.tasks.findOne(deleted!.id).exec()).parentId,
		originalParentId
	);
	eq(
		`${label} undo restores direct child parent`,
		(await db.tasks.findOne(directChild!.id).exec()).parentId,
		deleted!.id
	);
}

const validParent = await createTask({ title: 'Valid promotion parent' });
await checkDeletePromotion('valid parent', () => validParent!.id, (parentId) => parentId);
await checkDeletePromotion('missing parent', () => 'missing-parent', () => '');
await checkDeletePromotion('self parent', (deletedId) => deletedId, () => '');
await checkDeletePromotion('cyclic parent', (_deletedId, directChildId) => directChildId, () => '');

const invalidAncestor = await createTask({ title: 'Invalid ancestor' });
await (await db.tasks.findOne(invalidAncestor!.id).exec()).patch({ parentId: 'missing-ancestor' });
await checkDeletePromotion('invalid ancestor chain', () => invalidAncestor!.id, () => '');

reporter.finish('all corrupt delete promotion checks passed');
