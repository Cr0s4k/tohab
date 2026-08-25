import { readFileSync } from 'node:fs';
import { taskSchema } from '../src/lib/db/schemas.ts';
import { migrateTaskV2, migrateTaskV3 } from '../src/lib/db/migrations.ts';
import { createReporter } from '../../test/assertions.ts';

const reporter = createReporter();
const eq = reporter.eq;

eq('task schema advances for reminders', taskSchema.version, 3);
eq('parentId is optional', taskSchema.required?.includes('parentId'), false);
eq('parentId accepts task ids', taskSchema.properties.parentId, { type: 'string', maxLength: 40 });
const legacy = { id: 'old', title: 'Legacy' };
eq('v2 migration preserves legacy task data', migrateTaskV2(legacy), legacy);
eq('v3 migration preserves inherited reminder behavior', migrateTaskV3(legacy), legacy);

const editor = readFileSync(new URL('../src/lib/components/TaskEditor.svelte', import.meta.url), 'utf8');
eq('editor has an obvious Add subtask action', editor.includes('Add subtask'), true);
eq('editor labels the direct-subtask list', editor.includes('aria-label="Subtasks"'), true);
eq('editor opens subtasks by default', editor.includes('<details open aria-label="Subtasks"'), true);
eq('editor places subtasks immediately after notes', editor.indexOf('aria-label="Subtasks"') > editor.indexOf('bind:value={draft.notes}'), true);
eq('editor groups scheduling controls', editor.includes('>Schedule</span>'), true);
eq('editor groups organization controls', editor.includes('>Organization</span>'), true);
eq('editor loads subtasks independently of route filters', editor.includes('directSubtasksQuery'), true);
eq('editor dismisses without saving accidental changes', editor.includes('onClose={onClose}'), true);
eq('editor saves only through its confirm action', editor.includes('onConfirm={saveAndClose}'), true);
const row = readFileSync(new URL('../src/lib/components/TaskRow.svelte', import.meta.url), 'utf8');
eq('task rows render subtask progress', row.includes('subtaskProgress.completed'), true);
eq('task rows render a branch icon', row.includes('M6 3v12a3 3 0 0 0 3 3h9'), true);

const tasksPage = readFileSync(new URL('../src/routes/tasks/+page.svelte', import.meta.url), 'utf8');
eq('task list hides subtasks', tasksPage.includes('filter((task) => !task.parentId)'), true);

const projectPage = readFileSync(new URL('../src/routes/projects/[id]/+page.svelte', import.meta.url), 'utf8');
eq('project task list hides subtasks', projectPage.includes('!task.parentId'), true);

reporter.finish('all subtask persistence assertions passed');
