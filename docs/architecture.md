# Architecture

The app keeps every collection in RxDB over IndexedDB and works entirely from that local copy;
the server is a sync target, never a dependency for reading or writing.

## Sync

Each collection replicates independently through RxDB's replication protocol against three
endpoints:

- `GET /sync/pull?collection=&cursor=&id=&limit=` → `{ documents, checkpoint }`
- `POST /sync/push` → array of conflicting master documents
- `GET /sync/events` → SSE; a `change` event tells clients to re-pull

All three require a session cookie and answer `401` without one.

**Checkpoints ride on a server-owned revision counter, not timestamps.** Every write gets
`rev = max(rev) + 1` for that user, and pull cursors page through `(rev, id)`. A device
with a skewed clock therefore can never make the cursor jump past documents it hasn't
received.

**Timestamps are kept in two places, deliberately.** Each document carries `updatedAt` from
the writing device's clock; it replicates as data and is what conflict detection compares.
The server additionally stamps `receivedAt` from its own clock on every write, which gives
one trustworthy timeline no matter how wrong a device's clock is. `GET /sync/status` returns
both per collection, plus the drift between them:

```json
{
  "serverTime": 1700000000000,
  "collections": [
    { "collection": "tasks", "total": 2, "deleted": 0,
      "lastReceivedAt": 1699999999991, "lastClientUpdatedAt": 555 }
  ],
  "clockSkew": [{ "collection": "tasks", "skewMs": -1699999999445 }]
}
```

`receivedAt` is server-side metadata and is not replicated to clients, so it never has to
satisfy an RxDB schema.

**Conflicts are last-write-wins, gated on `assumedMasterState`.** A push is rejected if the
document exists on the server and the client's assumed `updatedAt` doesn't match the
current one; the server returns the master document and RxDB resolves locally. A blind
insert over an existing document is treated as a conflict rather than an overwrite.

The conflict check reads the master row `FOR UPDATE` inside the push transaction. This is
load-bearing on a connection pool: without the lock two concurrent pushes can both pass the
gate on the same base state and the second silently overwrites the first, and the losing
client is never told. `server/test/concurrency.test.ts` covers it — it fails without the
lock.

Deletes are soft — `_deleted: true` tombstones replicate like any other change, so a delete
on one device removes the document on the others.

## Authentication

Passwords are `scrypt` hashes; `GET /auth/state` tells a cold client whether to show sign-up
or sign-in, and registration closes once the first account exists.

The session is an `httpOnly`, `SameSite=Lax`, `Secure`-when-HTTPS cookie holding
`userId.expiry.hmac`, signed with a key in the `secrets` table and good for a year. Nothing
is stored per session, so there is no session table to expire — the trade is that a leaked
cookie stays valid until it expires; deleting the `session` row from `secrets` invalidates
every session at once. `/sync/*`, `/push/*` and `/calendar/token` require it; the `.ics`
feed does not, because a calendar client cannot sign in and its unguessable token is the
credential.

A cookie rather than a token in `localStorage`: the API is same-origin with the app in the
default deployment (nginx in production, the Vite proxy in dev), so the cookie needs no CORS
work, cannot be read by script if the page is ever XSS'd, and — the practical part — rides
along on `EventSource`, which cannot send headers.

Being offline-first, the app cannot ask the server who you are at launch, so a non-secret
`tohab.session` record in `localStorage` holds the signed-in id and email. That is what
renders the right screen offline and scopes the local database; the cookie remains the only
thing the server trusts. If it has expired, sync pauses with a visible warning while the
local data stays usable and editable until the person signs out and in again.

Each normalized `sync server URL + account id` selects a separate physical RxDB, so
switching server or account never mixes data or uploads unsynchronised changes under another
owner.

## Activity history and undo

Each entry stores the documents the action touched, `before` and `after`, as a JSON blob on
the entry itself. Undoing is then the same operation for every kind of action — upsert every
`before` that existed, remove every document that did not — which is why one code path
covers a task edit and a project delete that moved eleven tasks to the Inbox alike. The
immediate undo toast uses this path to restore an action.

Reverting marks the entry rather than adding a new one, and an entry is revertible once. An
undone entry stays in the list, struck through, because a history that quietly rewrites
itself is worse at answering "what did I do?" than one that does not.

The log replicates like every other collection, so an unbounded one would grow forever and be
pushed forever; it is capped at 200 entries and the oldest are dropped once the cap is
passed. Undo writes the old document back with a fresh `updatedAt`, so it is an ordinary
last-write-wins change like any other.

## Recurrence

Rules are stored on the task as one string — `[!]unit:interval[:extra]`, so `week:2:1` is
every other Monday. `app/src/lib/repeat.ts` owns the format, the descriptions the UI shows,
and the date arithmetic; `app/test/repeat.test.ts` covers it.

## Calendar feed

```
GET /calendar/token                    → { token, feedUrl? }   (requires a session)
GET /calendar/<token>/tohab.ics
```

- The URL carries an HMAC of your account id, never the id itself. Feed URLs get handed to
  Google and live in its history indefinitely, so a leaked feed URL must expose nothing but
  the feed. The HMAC key comes from `CALENDAR_SECRET`, or is generated once and stored in the
  `secrets` table.
- A repeating task becomes one event with an `RRULE`. `every!` rules deliberately get none:
  they count from whenever the task is actually completed, so no fixed schedule describes
  them and only the current due date is known.
- Completed or deleted tasks remain as `STATUS:CANCELLED` tombstones for
  `CALENDAR_TOMBSTONE_RETENTION_DAYS`, so polling calendar clients remove their prior copies.
  A task's project becomes the event's category.
- Times are emitted as floating local wall-clock — no `TZID`, no `Z`. Tohab stores what the
  device's calendar showed with no zone attached, so 9am stays 9am wherever it is read.

## Web Push

The server generates one P-256 VAPID pair atomically in the `secrets` table, stores
authenticated per-device subscriptions, scans timed open tasks in each subscription's IANA
timezone, and records each delivered occurrence so restarts do not duplicate it. Permanent
404/410 endpoints are removed automatically. Subscription endpoints and keys must never be
logged or exposed.

## Platform notes

- **Habit streaks honour backfilled history.** The streak floor follows the earliest logged
  day, not the habit's creation date, so filling in the heatmap retroactively works.
- **Portrait is intentional.** The installed app's manifest is locked to portrait as a
  product choice; wider screens get a sidebar layout in the browser.
- **iOS haptics are preserved.** Android uses `navigator.vibrate`; iOS receives the
  switch-control overlay workaround plus CSS press states.
- **Badging is capability-detected.** Unsupported browsers simply ignore it.
