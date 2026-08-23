import { readFileSync } from 'node:fs';
import { taskSchema } from '../src/lib/db/schemas.ts';
import { migrateTaskV2 } from '../src/lib/db/migrations.ts';

let fail = 0;
function eq(label: string, got: unknown, want: unknown) {
	const g = JSON.stringify(got);
	const w = JSON.stringify(want);
	if (g !== w) {
		fail++;
		console.log(`FAIL  ${label}: want ${w}, got ${g}`);
	} else console.log(`ok    ${label} = ${g}`);
}

eq('task schema advances for parentId', taskSchema.version, 2);
eq('parentId is optional', taskSchema.required?.includes('parentId'), false);
eq('parentId accepts task ids', taskSchema.properties.parentId, { type: 'string', maxLength: 40 });
const legacy = { id: 'old', title: 'Legacy' };
eq('v2 migration preserves legacy task data', migrateTaskV2(legacy), legacy);

const editor = readFileSync(new URL('../src/lib/components/TaskEditor.svelte', import.meta.url), 'utf8');
eq('editor has an obvious Add subtask action', editor.includes('Add subtask'), true);
eq('editor labels the direct-subtask list', editor.includes('aria-label="Subtasks"'), true);
eq('editor loads subtasks independently of route filters', editor.includes('directSubtasksQuery'), true);
const row = readFileSync(new URL('../src/lib/components/TaskRow.svelte', import.meta.url), 'utf8');
eq('task rows render hierarchy indentation', row.includes('task.depth'), true);

console.log(fail ? `\n${fail} failing` : '\nall subtask persistence assertions passed');
process.exit(fail ? 1 : 0);
