import { Subject, type Observable } from 'rxjs';
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import type { RxReplicationPullStreamItem } from 'rxdb';
import { browser } from '$app/environment';
import { settings } from '$lib/settings.svelte';
import { getDb } from './index.ts';
import { COLLECTION_NAMES, type CollectionName } from './schemas.ts';

/** The cursor is a server-owned monotonic revision, not a timestamp, so client clock
 *  skew can never make the pull cursor skip documents. */
export type Checkpoint = { cursor: number; id: string };

export type SyncPhase = 'off' | 'offline' | 'syncing' | 'synced' | 'error';

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

let states: RxReplicationState<unknown, Checkpoint>[] = [];
let streams: Subject<RxReplicationPullStreamItem<unknown, Checkpoint>>[] = [];
let source: EventSource | null = null;
const active = new Set<CollectionName>();

function headers() {
	return { 'content-type': 'application/json', 'x-user-id': settings.userId };
}

function settle() {
	if (sync.phase === 'off') return;
	if (active.size > 0) {
		sync.phase = 'syncing';
		return;
	}
	if (!navigator.onLine) {
		sync.phase = 'offline';
		return;
	}
	if (sync.phase === 'error') return;
	sync.phase = 'synced';
	sync.pending = 0;
	sync.lastSyncedAt = Date.now();
}

function replicate(name: CollectionName, collection: never) {
	const stream$ = new Subject<RxReplicationPullStreamItem<unknown, Checkpoint>>();
	streams.push(stream$);

	const state = replicateRxCollection<unknown, Checkpoint>({
		collection,
		replicationIdentifier: `tohab-${name}-${settings.serverUrl}`,
		live: true,
		retryTime: 6000,
		waitForLeadership: true,
		pull: {
			batchSize: 200,
			stream$: stream$.asObservable() as Observable<
				RxReplicationPullStreamItem<unknown, Checkpoint>
			>,
			async handler(checkpoint, batchSize) {
				const params = new URLSearchParams({
					collection: name,
					limit: String(batchSize),
					cursor: String(checkpoint?.cursor ?? 0),
					id: checkpoint?.id ?? ''
				});
				const res = await fetch(`${settings.serverUrl}/pull?${params}`, { headers: headers() });
				if (!res.ok) throw new Error(`pull ${name} failed: ${res.status}`);
				return res.json();
			}
		},
		push: {
			batchSize: 100,
			async handler(rows) {
				const res = await fetch(`${settings.serverUrl}/push`, {
					method: 'POST',
					headers: headers(),
					body: JSON.stringify({ collection: name, rows })
				});
				if (!res.ok) throw new Error(`push ${name} failed: ${res.status}`);
				const conflicts = await res.json();
				if (conflicts.length) sync.conflicts += conflicts.length;
				return conflicts;
			}
		}
	});

	state.active$.subscribe((isActive) => {
		if (isActive) {
			active.add(name);
			if (sync.phase !== 'error') sync.phase = 'syncing';
		} else {
			active.delete(name);
			settle();
		}
	});

	state.error$.subscribe((err) => {
		sync.phase = navigator.onLine ? 'error' : 'offline';
		sync.message = err.message ?? String(err);
	});

	return state as RxReplicationState<unknown, Checkpoint>;
}

/** Ask every collection to re-pull; used on reconnect and on server-sent change events. */
export function resync() {
	for (const s of streams) s.next('RESYNC');
}

function openEventStream() {
	source?.close();
	try {
		source = new EventSource(`${settings.serverUrl}/events?userId=${settings.userId}`);
		source.addEventListener('change', () => resync());
		source.addEventListener('error', () => {
			// EventSource retries on its own; replication keeps polling meanwhile.
		});
	} catch {
		source = null;
	}
}

export async function startSync() {
	if (!browser || states.length) return;
	if (!settings.syncEnabled) {
		sync.phase = 'off';
		return;
	}

	const db = await getDb();
	sync.phase = navigator.onLine ? 'syncing' : 'offline';
	states = COLLECTION_NAMES.map((name) => replicate(name, db[name] as never));
	openEventStream();

	addEventListener('online', () => {
		resync();
		settle();
	});
	addEventListener('offline', () => {
		sync.phase = 'offline';
	});
}

export async function stopSync() {
	source?.close();
	source = null;
	await Promise.all(states.map((s) => s.cancel()));
	states = [];
	streams = [];
	active.clear();
	sync.phase = 'off';
}

export async function restartSync() {
	await stopSync();
	await startSync();
}
