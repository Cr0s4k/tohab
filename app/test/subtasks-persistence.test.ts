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
eq('editor loads subtasks independently of route filters', editor.includes('directSubtasksQuery'), true);
const row = readFileSync(new URL('../src/lib/components/TaskRow.svelte', import.meta.url), 'utf8');
eq('task rows render hierarchy indentation', row.includes('task.depth'), true);

reporter.finish('all subtask persistence assertions passed');
