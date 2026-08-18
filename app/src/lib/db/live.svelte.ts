import { browser } from '$app/environment';
import { getDb } from './lazy.ts';
import type { Db } from './index.ts';

/** A reactive handle to the singleton database, so components can build queries inline. */
export const live = $state({ db: null as Db | null, error: '' });

if (browser) {
	getDb().then(
		(db) => (live.db = db),
		(err) => (live.error = err?.message ?? String(err))
	);
}
