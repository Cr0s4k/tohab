import type { Db } from './index.ts';

/**
 * RxDB and its Dexie storage are the largest thing the app ships. Reaching the database
 * through here keeps that code out of every chunk the shell waits on: it is fetched on the
 * first actual database use instead.
 */
export async function getDb(): Promise<Db> {
	const { getDb: open } = await import('./index.ts');
	return open();
}

export async function removeDb(): Promise<void> {
	const { removeDb: remove } = await import('./index.ts');
	return remove();
}
