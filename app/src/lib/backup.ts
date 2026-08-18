import { getDb } from './db/lazy.ts';
import { COLLECTION_NAMES, type CollectionName } from './db/schemas.ts';
import { markLocalWrite } from './db/syncState.svelte.ts';

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

	for (const name of COLLECTION_NAMES) {
		const rows = parsed.data?.[name] ?? [];
		for (const row of rows) {
			try {
				await db[name].upsert(row as never);
				imported++;
			} catch {
				skipped++;
			}
		}
	}
	if (imported) markLocalWrite();
	return { imported, skipped };
}
