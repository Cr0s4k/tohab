import { toKey } from './dates.ts';
import { parseQuickAdd } from './parse.ts';
import { createTask } from './tasks.ts';

export type ImportResult = { imported: number; skipped: number };

type TodoistRow = {
	content: string;
	description: string;
	comments: string[];
	priority: number;
	indent: number;
	date: string;
	deadline: string;
};

type ImportedTaskInput = {
	title: string;
	notes?: string;
	due?: string;
	dueTime?: string;
	priority?: number;
	repeat?: string;
	parentId?: string;
};

type CreateImportedTask = (input: ImportedTaskInput) => Promise<{ id: string } | null>;

function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];

		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += ch;
			}
			continue;
		}

		if (ch === '"') {
			inQuotes = true;
		} else if (ch === ',') {
			row.push(field);
			field = '';
		} else if (ch === '\n' || ch === '\r') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			if (ch === '\r' && text[i + 1] === '\n') i++;
		} else {
			field += ch;
		}
	}

	if (field !== '' || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	return rows;
}

type ParsedDate = { due: string; dueTime: string; repeat: string };

function parseTodoistDate(value: string, base = new Date()): ParsedDate {
	const trimmed = value.trim();
	if (!trimmed) return { due: '', dueTime: '', repeat: '' };

	// Todoist exports absolute dates like 2026-08-17 or 2026-08-17T17:00:00Z.
	const absolute = trimmed.match(
		/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2})?)?/
	);
	if (absolute) {
		const year = Number(absolute[1]);
		const month = Number(absolute[2]);
		const day = Number(absolute[3]);
		const date = new Date(year, month - 1, day);
		if (
			!Number.isNaN(date.getTime()) &&
			date.getFullYear() === year &&
			date.getMonth() === month - 1 &&
			date.getDate() === day
		) {
			const h = absolute[4] ? Number(absolute[4]) : undefined;
			const min = absolute[5] ? Number(absolute[5]) : undefined;
			return {
				repeat: '',
				due: toKey(date),
				dueTime:
					h !== undefined && min !== undefined && h < 24 && min < 60
						? `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
						: ''
			};
		}
	}

	// Fall back to the same natural-language parser used by quick add, which is also what
	// reads Todoist's recurring rules: it exports those as the phrase, "every 3 weeks".
	const parsed = parseQuickAdd(trimmed, base);
	return { due: parsed.due, dueTime: parsed.dueTime, repeat: parsed.repeat };
}

export function parseTodoistRows(raw: string): TodoistRow[] {
	const rows = parseCsv(raw.replace(/^\uFEFF/, ''));
	if (rows.length < 2) throw new Error('This does not look like a Todoist CSV export.');

	const header = rows[0].map((cell) => cell.trim().toLowerCase());
	const index = (name: string) => {
		const found = header.indexOf(name);
		if (found !== -1) return found;
		// Todoist has used both DURATION_UNIT and DURATION UNIT in older exports.
		const withoutUnderscores = name.replace(/_/g, ' ');
		return header.indexOf(withoutUnderscores);
	};

	const typeIndex = index('type');
	const contentIndex = index('content');
	if (typeIndex === -1 || contentIndex === -1) {
		throw new Error('This does not look like a Todoist CSV export.');
	}

	const descriptionIndex = index('description');
	const priorityIndex = index('priority');
	const indentIndex = index('indent');
	const dateIndex = index('date');
	const deadlineIndex = index('deadline');

	const out: TodoistRow[] = [];
	let previousTask: TodoistRow | undefined;
	for (const row of rows.slice(1)) {
		const type = (row[typeIndex] ?? '').trim().toLowerCase();
		const content = (row[contentIndex] ?? '').trim();
		const description = (row[descriptionIndex] ?? '').trim();

		if (type === 'note') {
			const comment = [content, description].filter(Boolean).join('\n\n');
			if (previousTask && comment) previousTask.comments.push(comment);
			continue;
		}
		if (type !== 'task') {
			if (type) previousTask = undefined;
			continue;
		}
		if (!content) continue;

		const rawPriority = Number(row[priorityIndex] ?? 4);
		const rawIndent = Number(row[indentIndex] ?? 1);
		const task = {
			content,
			description,
			comments: [],
			priority: rawPriority >= 1 && rawPriority <= 4 ? rawPriority : 4,
			indent: Number.isInteger(rawIndent) && rawIndent > 0 ? rawIndent : 1,
			date: row[dateIndex] ?? '',
			deadline: row[deadlineIndex] ?? ''
		};
		out.push(task);
		previousTask = task;
	}

	return out;
}

export async function importTodoistCsv(
	raw: string,
	createImportedTask: CreateImportedTask = createTask
): Promise<ImportResult> {
	const rows = parseTodoistRows(raw);
	let imported = 0;
	let skipped = 0;
	const taskIdsByIndent: string[] = [];

	for (const row of rows) {
		const { due, dueTime, repeat } = parseTodoistDate(row.date || row.deadline);
		const notes = [row.description, ...row.comments].filter(Boolean).join('\n\n');
		const parentId = row.indent > 1 ? taskIdsByIndent[row.indent - 2] : undefined;

		try {
			const task = await createImportedTask({
				title: row.content,
				notes,
				due,
				dueTime,
				repeat,
				priority: row.priority,
				...(parentId ? { parentId } : {})
			});
			if (!task) {
				skipped++;
				taskIdsByIndent.length = Math.min(taskIdsByIndent.length, row.indent - 1);
				continue;
			}
			taskIdsByIndent[row.indent - 1] = task.id;
			taskIdsByIndent.length = row.indent;
			imported++;
		} catch {
			skipped++;
			taskIdsByIndent.length = Math.min(taskIdsByIndent.length, row.indent - 1);
		}
	}

	return { imported, skipped };
}
