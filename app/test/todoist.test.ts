import { importTodoistCsv, parseTodoistRows } from '../src/lib/todoist.ts';
import { createReporter } from '../../test/assertions.ts';

const reporter = createReporter();
const check = reporter.check;

const csv = `TYPE,CONTENT,DESCRIPTION,IS_COLLAPSED,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DURATION,DURATION_UNIT,DEADLINE,DEADLINE_LANG
meta,view_style=list,,,,,,,,,,,,,
task,Parent,Parent description,,1,1,Omar,,,,Europe/Madrid,,,,
note,First comment,,,,,Omar,2026-08-20T10:00:00Z,,,,,,
note,"Second, comment",,,,,Omar,2026-08-20T11:00:00Z,,,,,,
task,Child,,,2,2,Omar,,,,Europe/Madrid,,,,
task,Grandchild,,,3,3,Omar,,,,Europe/Madrid,,,,
task,Sibling,,,4,2,Omar,,,,Europe/Madrid,,,,
task,Second root,,,4,1,Omar,,,,Europe/Madrid,,,,
note,Root comment,,,,,Omar,2026-08-20T12:00:00Z,,,,,,
section,Ignored section,,,,1,,,,,,,,,
note,Orphan comment,,,,,Omar,2026-08-20T13:00:00Z,,,,,,`;

const rows = parseTodoistRows(csv);
check('notes are folded into task rows', rows.map(({ content, description, comments, indent }) => ({
	content,
	description,
	comments,
	indent
})), [
	{ content: 'Parent', description: 'Parent description', comments: ['First comment', 'Second, comment'], indent: 1 },
	{ content: 'Child', description: '', comments: [], indent: 2 },
	{ content: 'Grandchild', description: '', comments: [], indent: 3 },
	{ content: 'Sibling', description: '', comments: [], indent: 2 },
	{ content: 'Second root', description: '', comments: ['Root comment'], indent: 1 }
]);

const created: Array<Record<string, unknown>> = [];
const result = await importTodoistCsv(csv, async (input) => {
	created.push(input);
	return { id: `task-${created.length}` };
});

check('only Todoist tasks are imported', result, { imported: 5, skipped: 0 });
check('descriptions and comments share task notes', created.map(({ title, notes }) => ({ title, notes })), [
	{ title: 'Parent', notes: 'Parent description\n\nFirst comment\n\nSecond, comment' },
	{ title: 'Child', notes: '' },
	{ title: 'Grandchild', notes: '' },
	{ title: 'Sibling', notes: '' },
	{ title: 'Second root', notes: 'Root comment' }
]);
check('indentation becomes parent ids', created.map(({ title, parentId }) => ({ title, parentId })), [
	{ title: 'Parent', parentId: undefined },
	{ title: 'Child', parentId: 'task-1' },
	{ title: 'Grandchild', parentId: 'task-2' },
	{ title: 'Sibling', parentId: 'task-1' },
	{ title: 'Second root', parentId: undefined }
]);

reporter.finish('all Todoist import assertions passed');
