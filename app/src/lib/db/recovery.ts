export type DatabaseFailure = 'migration' | 'storage' | 'transient' | 'unknown';

export function classifyDatabaseError(error: unknown): DatabaseFailure {
	const text = `${error instanceof Error ? `${error.name} ${error.message}` : String(error)}`.toLowerCase();
	if (/version|migration|schema/.test(text)) return 'migration';
	if (/quota|storage|disk|space/.test(text)) return 'storage';
	if (/invalidstate|closing|blocked|abort|transactioninactive/.test(text)) return 'transient';
	return 'unknown';
}

export function databaseOwnerKey(serverUrl: string, userId: string): string {
	const base = typeof location === 'undefined' ? 'https://local.invalid/' : location.origin;
	const url = new URL(serverUrl || '/sync', base);
	url.hash = '';
	url.search = '';
	url.pathname = url.pathname.replace(/\/+$/, '') || '/';
	return `${url.toString().replace(/\/$/, '')}::${userId}`;
}

/** Stable, URL-safe RxDB name for a server/account owner without exposing either value. */
export function databaseNameForOwner(ownerKey: string): string {
	// 64-bit FNV-1a keeps names deterministic and makes accidental owner aliases negligible.
	let hash = 0xcbf29ce484222325n;
	for (let index = 0; index < ownerKey.length; index += 1) {
		hash ^= BigInt(ownerKey.charCodeAt(index));
		hash = BigInt.asUintN(64, hash * 0x100000001b3n);
	}
	return `tohab-${hash.toString(36)}`;
}

export function databaseMappingKey(ownerKey: string): string {
	return `tohab.dbName.${databaseNameForOwner(ownerKey)}`;
}

/** Kept as a named migration boundary for the previous user-only ownership value. */
export function legacyOwnerKey(userId: string): string {
	return userId;
}
