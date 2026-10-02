import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	classifyDatabaseError,
	databaseMappingKey,
	databaseNameForOwner,
	databaseOwnerKey,
	legacyOwnerKey
} from '../src/lib/db/recovery.ts';
import { isIosLike, shouldBypassServiceWorker, shouldAnimateList, shouldRuntimeCacheRequest } from '../src/lib/pwa.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

assert.equal(classifyDatabaseError(new Error('VersionError: migration missing')), 'migration');
assert.equal(classifyDatabaseError(new Error('QuotaExceededError')), 'storage');
assert.equal(classifyDatabaseError(new Error('InvalidStateError database is closing')), 'transient');
assert.equal(classifyDatabaseError(new Error('unexpected corruption')), 'unknown');
assert.equal(databaseOwnerKey('/sync', 'user-1'), 'https://local.invalid/sync::user-1');
assert.equal(databaseOwnerKey('https://sync.example/a/', 'user-1'), 'https://sync.example/a::user-1');
assert.equal(legacyOwnerKey('u'), 'u');
const ownerA = databaseNameForOwner('https://one.example/sync::user-1');
const ownerB = databaseNameForOwner('https://two.example/sync::user-1');
assert.match(ownerA, /^tohab-[a-z0-9]+$/);
assert.ok(ownerA.length > 12, 'database ownership uses a collision-resistant 64-bit identifier');
assert.notEqual(ownerA, ownerB, 'different sync servers keep isolated local databases');
assert.equal(databaseNameForOwner('https://one.example/sync::user-1'), ownerA, 'database names are stable');
assert.equal(databaseMappingKey('https://one.example/sync::user-1'), `tohab.dbName.${ownerA}`);

for (const path of ['/sync/pull', '/auth/me', '/calendar/token', '/push/config']) {
	assert.equal(shouldBypassServiceWorker(new URL(`https://example.test${path}`)), true, path);
}
const calendarClient = read('src/lib/calendar.ts');
assert.doesNotMatch(calendarClient, /calendarBase\(settings\.serverUrl\).*\/settings/s);
assert.match(calendarClient, /feedUrl: publicFeedUrl/);
assert.match(calendarClient, /if \(publicFeedUrl\) return new URL\(publicFeedUrl\)\.toString\(\)/);
assert.doesNotMatch(calendarClient, /searchParams\.set\(['"]alarm['"]/);
assert.equal(shouldBypassServiceWorker(new URL('https://example.test/tasks')), false);
assert.equal(shouldRuntimeCacheRequest(''), false, 'fetch/XHR responses never enter the runtime cache');
assert.equal(shouldRuntimeCacheRequest('script'), true);
assert.equal(shouldRuntimeCacheRequest('image'), true);
assert.equal(shouldAnimateList(39), true);
assert.equal(shouldAnimateList(40), false);
assert.equal(isIosLike('Mozilla/5.0 (iPhone)', 'iPhone', 5), true);
assert.equal(isIosLike('Mozilla/5.0 (Macintosh)', 'MacIntel', 5), true, 'iPadOS desktop user agent is detected');
assert.equal(isIosLike('Mozilla/5.0 (Macintosh)', 'MacIntel', 0), false);

const replication = read('src/lib/db/replication.svelte.ts');
const liveDb = read('src/lib/db/live.svelte.ts');
const dbSession = read('src/lib/db/session.svelte.ts');
const dbIndex = read('src/lib/db/index.ts');
assert.doesNotMatch(liveDb, /getDb\(\)/, 'database selection happens before live initialization');
assert.match(dbSession, /await closeDb\(\)[\s\S]*?adoptLocalDb/);
assert.match(dbSession, /live\.db = db/);
assert.match(dbSession, /export async function unmountLocalDb\(\)[\s\S]*?const attempt = \+\+bootAttempt[\s\S]*?if \(attempt !== bootAttempt\) return;[\s\S]*?await closeDb\(\)/);
assert.match(dbIndex, /export async function closeDb/);
assert.doesNotMatch(dbIndex, /onblocked\s*=\s*\(\)\s*=>\s*\{[\s\S]{0,200}reject/);
assert.doesNotMatch(replication, /function unauthorized\(\)[\s\S]*?forget\(\)/);
assert.match(replication, /stopSync\(true\)/);

const sw = read('src/service-worker/index.ts');
const pwaStatus = read('src/lib/components/PwaStatus.svelte');
assert.match(sw, /SKIP_WAITING/);
assert.match(pwaStatus, /reloadForUpdate/);
assert.match(pwaStatus, /if \(reloadForUpdate\) location\.reload\(\)/);
assert.match(sw, /addEventListener\('push'/);
assert.match(sw, /addEventListener\('notificationclick'/);
assert.match(sw, /addEventListener\('pushsubscriptionchange'/);
assert.doesNotMatch(sw, /\.then\(\(\) => sw\.skipWaiting\(\)\)/);
assert.match(sw, /request\.mode === 'navigate'/);
assert.match(
	sw,
	/request\.mode === 'navigate'\)\s*\{[\s\S]*?caches\.open\(PRECACHE_NAME\)[\s\S]*?cache\.match\('\/'\)\)\s*\?\?\s*fetch\(request\)/,
	'a cold launch answers the document from cache before it ever considers the network'
);
assert.doesNotMatch(sw, /fetch\(request\)\.catch\(async \(\) => \{/, 'no handler makes the network the primary path for the shell');
assert.match(
	sw,
	/const cached = await cache\.match\(request\);\s*if \(cached\) \{\s*event\.waitUntil\(store\(cache, request\)\);\s*return cached;/,
	'cached assets are served immediately and revalidated in the background'
);
assert.match(sw, /\.\.\.files, '\/'/);
assert.doesNotMatch(sw, /index\.html/);
assert.match(read('src/lib/pwa.ts'), /\/auth/);
assert.match(read('src/lib/pwa.ts'), /\/calendar/);

const manifest = JSON.parse(read('static/manifest.webmanifest'));
assert.equal(manifest.id, '/');
assert.equal(manifest.orientation, 'portrait');
const tabBar = read('src/lib/components/TabBar.svelte');
const habitNav = read('src/lib/components/HabitNav.svelte');
const layout = read('src/routes/+layout.svelte');
const css = read('src/app.css');
assert.match(layout, /class="[^\"]*\bapp-shell\b[^\"]*"/, 'the app uses the standalone-safe shell utility');
assert.match(
	css,
	/@utility app-shell\s*\{\s*height:\s*100%;\s*\}/,
	'the shell fills the fixed body without adding the safe-area inset twice'
);
assert.match(tabBar, /\bpb-safe\b/, 'the task tab bar keeps home-indicator padding');
assert.match(habitNav, /\bpb-safe\b/, 'the habit tab bar keeps home-indicator padding');
assert.match(pwaStatus, /Safari or Firefox/, 'iOS install guidance covers Firefox');
const html = read('src/app.html');
assert.doesNotMatch(html, /maximum-scale/);
assert.match(html, /apple-mobile-web-app-status-bar-style/);

const sheet = read('src/lib/components/Sheet.svelte');
assert.match(sheet, /role="dialog"/);
assert.match(sheet, /aria-modal=\{covered \? undefined : 'true'\}/);
assert.match(sheet, /inert=\{covered\}/);
assert.match(sheet, /aria-labelledby/);
assert.match(sheet, /focusable/);
assert.match(sheet, /focusTarget/);
assert.match(sheet, /sheet-dialog:focus/);
assert.match(sheet, /onConfirm = onClose/);
assert.match(sheet, /onclick=\{onConfirm\}/);

const nginx = read('../docker/nginx.conf');
assert.match(nginx, /gzip on;/);
assert.match(nginx, /application\/manifest\+json/);

const haptics = read('src/lib/haptics.ts');
assert.match(haptics, /input\.setAttribute\('switch', ''\)/);
assert.match(haptics, /position:absolute;inset:0;touch-action:manipulation/);
assert.match(haptics, /navigator\.vibrate\?\.\(patterns\[pattern\]\)/);

console.log('all PWA hardening contracts passed');
