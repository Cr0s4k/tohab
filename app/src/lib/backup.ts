import { getDb } from './db/lazy.ts';
import { COLLECTION_NAMES, type CollectionName } from './db/schemas.ts';
import { markLocalWrite } from './db/syncState.svelte.ts';
import { isValidKey } from './dates.ts';

export type Backup = {
	format: 'tohab-backup';
	version: 1;
	exportedAt: string;
	data: Record<CollectionName, Record<string, unknown>[]>;
};

export async function exportBackup(): Promise<Backup> {
	const db = await getDb();
	const data = {} as Backup['data'];
	for (const name of COLLECTION_NAMES) {
		const docs = await db[name].find().exec();
		data[name] = docs.map((d) => d.toMutableJSON());
	}
	return { format: 'tohab-backup', version: 1, exportedAt: new Date().toISOString(), data };
}

export async function downloadBackup() {
	const backup = await exportBackup();
	const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `tohab-${backup.exportedAt.slice(0, 10)}.json`;
	a.click();
	URL.revokeObjectURL(url);
}

export type ImportResult = { imported: number; skipped: number };

export async function importBackup(raw: string): Promise<ImportResult> {
	const parsed = JSON.parse(raw) as Backup;
	if (parsed?.format !== 'tohab-backup') throw new Error('Not a Tohab backup file');

	const db = await getDb();
	let imported = 0;
	let skipped = 0;
	// Check the complete merged history before writing anything. Habits are imported
	// before logs, and an old backup must not erase a date chosen on this device.
	const currentHabits = await db.habits.find().exec();
	const versionedHabits = new Set(currentHabits.filter((habit) => habit.historyVersion === 1).map((habit) => habit.id));
	const habitDates = new Map(currentHabits.map((habit) => [habit.id, habit.startDate]));
	for (const row of parsed.data?.habits ?? []) {
		if (row.historyVersion === 1) versionedHabits.add(String(row.id));
		if (row.startDate !== undefined) {
			if (typeof row.startDate !== 'string' || !isValidKey(row.startDate)) {
				throw new Error('The backup contains an invalid habit start date.');
			}
			habitDates.set(String(row.id), row.startDate);
		}
	}
	const existingRevisions = await db.habitRevisions.find().exec();
	const baselineIds = new Set([...existingRevisions.map((revision) => revision.toMutableJSON()), ...(parsed.data?.habitRevisions ?? [])]
		.filter((revision) => revision.id === revision.habitId && revision.effectiveFrom === '0001-01-01').map((revision) => String(revision.habitId)));
	for (const id of versionedHabits) {
		if (!baselineIds.has(id)) throw new Error('The backup is missing habit history. Import a complete backup.');
	}
	const currentLogs = await db.habitLogs.find().exec();
	for (const log of [...currentLogs.map((log) => log.toMutableJSON()), ...(parsed.data?.habitLogs ?? [])]) {
		const start = habitDates.get(String(log.habitId));
		if (start && typeof log.date === 'string' && log.date < start) {
			throw new Error('The backup conflicts with a habit start date. Move its start date earlier before importing.');
		}
	}

	for (const name of COLLECTION_NAMES) {
		const rows = parsed.data?.[name] ?? [];
		for (const row of rows) {
			try {
				const startDate = name === 'habits' ? habitDates.get(String(row.id)) : undefined;
				const historyVersion = name === 'habits' && versionedHabits.has(String(row.id)) ? 1 : undefined;
				await db[name].upsert({ ...row, ...(startDate ? { startDate } : {}), ...(historyVersion ? { historyVersion } : {}) } as never);
				imported++;
			} catch {
				skipped++;
			}
		}
	}
	if (imported) markLocalWrite();
	return { imported, skipped };
}
