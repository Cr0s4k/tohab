export type SyncPhase = 'off' | 'offline' | 'syncing' | 'synced' | 'error' | 'unauthorized';

export const sync = $state({
	phase: 'off' as SyncPhase,
	pending: 0,
	conflicts: 0,
	lastSyncedAt: 0,
	message: ''
});

/**
 * Local writes are counted optimistically and cleared once every collection reports
 * an idle replication cycle, which is the only signal RxDB exposes for "fully pushed".
 */
export function markLocalWrite() {
	sync.pending += 1;
}
