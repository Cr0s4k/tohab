import { settings } from '$lib/settings.svelte';
import { hideSplash } from '$lib/splash';
import { closeDb, getDb, removeDb, retryDb } from './lazy.ts';
import { live } from './live.svelte.ts';
import {
	classifyDatabaseError,
	databaseMappingKey,
	databaseNameForOwner,
	databaseOwnerKey
} from './recovery.ts';

export const localDbSession = $state({
	ready: false,
	error: '',
	failure: '',
	confirmingReset: false
});

let bootAttempt = 0;

/** Selects one physical RxDB per server/account pair without deleting another owner's data. */
export function adoptLocalDb(userId: string) {
	const owner = localStorage.getItem('tohab.dbOwner');
	const next = databaseOwnerKey(settings.serverUrl, userId);
	const mapping = databaseMappingKey(next);
	const currentName = localStorage.getItem('tohab.dbName') || 'tohab';
	let databaseName = localStorage.getItem(mapping);

	if (!databaseName && (owner === next || owner === userId || owner === null)) {
		databaseName = currentName;
	}
	databaseName ??= databaseNameForOwner(next);
	localStorage.setItem(mapping, databaseName);
	localStorage.setItem('tohab.dbOwner', next);
	localStorage.setItem('tohab.dbName', databaseName);
}

export async function bootLocalDb(userId: string, retry = false) {
	const attempt = ++bootAttempt;
	localDbSession.ready = false;
	localDbSession.error = '';
	live.db = null;
	live.error = '';
	try {
		const { stopSync, startSync } = await import('./replication.svelte.ts');
		await stopSync();
		await closeDb();
		if (attempt !== bootAttempt) return;
		adoptLocalDb(userId);
		const db = await (retry ? retryDb() : getDb());
		if (attempt !== bootAttempt) {
			await closeDb();
			return;
		}
		live.db = db;
		localDbSession.ready = true;
		void startSync();
	} catch (error) {
		if (attempt !== bootAttempt) return;
		localDbSession.failure = classifyDatabaseError(error);
		localDbSession.error = (error instanceof Error ? error.message : String(error)) || 'Unknown database error';
		live.error = localDbSession.error;
		hideSplash();
	}
}

export async function unmountLocalDb() {
	const attempt = ++bootAttempt;
	localDbSession.ready = false;
	live.db = null;
	const { stopSync } = await import('./replication.svelte.ts');
	await stopSync();
	if (attempt !== bootAttempt) return;
	await closeDb();
}

export async function resetLocalDbAfterFailure(userId: string) {
	if (!localDbSession.confirmingReset) {
		localDbSession.confirmingReset = true;
		return;
	}
	try {
		await removeDb();
		localDbSession.confirmingReset = false;
		await bootLocalDb(userId, true);
	} catch (error) {
		localDbSession.error = error instanceof Error ? error.message : String(error);
	}
}
