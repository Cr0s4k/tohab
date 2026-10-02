import { Subject, type Observable, type Subscription } from 'rxjs';
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import type { RxReplicationPullStreamItem } from 'rxdb';
import { browser } from '$app/env';
import { settings } from '#lib/settings.svelte.js';
import { auth } from '#lib/auth.svelte.js';
import { getDb } from './index.ts';
import { COLLECTION_NAMES, type CollectionName } from './schemas.ts';
import { sync } from './syncState.svelte.ts';

/** The cursor is a server-owned monotonic revision, not a timestamp, so client clock
 *  skew can never make the pull cursor skip documents. */
export type Checkpoint = { cursor: number; id: string };

export { sync, markLocalWrite, type SyncPhase } from './syncState.svelte.ts';

let states: RxReplicationState<unknown, Checkpoint>[] = [];
let streams: Subject<RxReplicationPullStreamItem<unknown, Checkpoint>>[] = [];
let source: EventSource | null = null;
const active = new Set<CollectionName>();
let subscriptions: Subscription[] = [];
let listenersInstalled = false;

function headers() {
	return { 'content-type': 'application/json', 'x-tohab-habit-history': '1' };
}

/**
 * An expired cookie pauses replication but deliberately keeps the remembered identity and
 * local database mounted, so offline work remains available until the person signs in again.
 */
function unauthorized() {
	sync.phase = 'unauthorized';
	sync.message = 'Session expired. Local data is safe; sign out and in again to resume syncing.';
	void stopSync(true);
}

function settle() {
	if (sync.phase === 'off' || sync.phase === 'unauthorized') return;
	if (active.size > 0) {
		sync.phase = 'syncing';
		return;
	}
	if (!navigator.onLine) {
		sync.phase = 'offline';
		return;
	}
	sync.phase = 'synced';
	sync.message = '';
	sync.pending = 0;
	sync.lastSyncedAt = Date.now();
}

function replicate(name: CollectionName, collection: never) {
	const stream$ = new Subject<RxReplicationPullStreamItem<unknown, Checkpoint>>();
	streams.push(stream$);

	const state = replicateRxCollection<unknown, Checkpoint>({
		collection,
		replicationIdentifier: `tohab-${name}-${auth.session?.userId ?? 'anon'}-${settings.serverUrl}`,
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
				const res = await fetch(`${settings.serverUrl}/pull?${params}`, {
					credentials: 'include',
					headers: headers()
				});
				if (res.status === 401) {
					unauthorized();
					throw new Error('unauthorized');
				}
				if (!res.ok) throw new Error(`pull ${name} failed: ${res.status}`);
				return res.json();
			}
		},
		push: {
			batchSize: 100,
			async handler(rows) {
				const res = await fetch(`${settings.serverUrl}/push`, {
					method: 'POST',
					credentials: 'include',
					headers: headers(),
					body: JSON.stringify({ collection: name, rows })
				});
				if (res.status === 401) {
					unauthorized();
					throw new Error('unauthorized');
				}
				if (res.status === 426) throw new Error('Update Tohab on all devices to sync habit history.');
				if (!res.ok) throw new Error(`push ${name} failed: ${res.status}`);
				const conflicts = await res.json();
				if (conflicts.length) sync.conflicts += conflicts.length;
				return conflicts;
			}
		}
	});

	subscriptions.push(state.active$.subscribe((isActive) => {
		if (isActive) {
			active.add(name);
			if (sync.phase !== 'error') sync.phase = 'syncing';
		} else {
			active.delete(name);
			settle();
		}
	}));

	subscriptions.push(state.error$.subscribe((err) => {
		if (sync.phase === 'unauthorized') return;
		sync.phase = navigator.onLine ? 'error' : 'offline';
		sync.message = err.message ?? String(err);
	}));

	return state as RxReplicationState<unknown, Checkpoint>;
}

/** Ask every collection to re-pull; used on reconnect and on server-sent change events. */
export function resync() {
	if (sync.phase === 'error' && navigator.onLine) {
		sync.phase = 'syncing';
		sync.message = '';
	}
	for (const s of streams) s.next('RESYNC');
}

function onOnline() { resync(); settle(); }
function onOffline() { sync.phase = 'offline'; }
function onForeground() {
	if (document.visibilityState === 'hidden' || !states.length) return;
	openEventStream();
	resync();
}
function installLifecycleListeners() {
	if (listenersInstalled) return;
	addEventListener('online', onOnline);
	addEventListener('offline', onOffline);
	addEventListener('pageshow', onForeground);
	document.addEventListener('visibilitychange', onForeground);
	listenersInstalled = true;
}
function removeLifecycleListeners() {
	if (!listenersInstalled) return;
	removeEventListener('online', onOnline);
	removeEventListener('offline', onOffline);
	removeEventListener('pageshow', onForeground);
	document.removeEventListener('visibilitychange', onForeground);
	listenersInstalled = false;
}

function openEventStream() {
	source?.close();
	try {
		// EventSource cannot set headers, which is exactly why the session is a cookie: it
		// rides along automatically instead of being spelled out in the query string.
		source = new EventSource(`${settings.serverUrl}/events`, { withCredentials: true });
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
	if (!auth.session) {
		sync.phase = 'off';
		return;
	}

	const db = await getDb();
	sync.phase = navigator.onLine ? 'syncing' : 'offline';
	states = COLLECTION_NAMES.map((name) => replicate(name, db[name] as never));
	openEventStream();
	installLifecycleListeners();
}

export async function stopSync(preservePhase = false) {
	source?.close();
	source = null;
	await Promise.all(states.map((s) => s.cancel()));
	for (const subscription of subscriptions) subscription.unsubscribe();
	subscriptions = [];
	removeLifecycleListeners();
	states = [];
	streams = [];
	active.clear();
	if (!preservePhase) sync.phase = 'off';
}

export async function restartSync() {
	await stopSync();
	await startSync();
}
