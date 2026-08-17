# Tohab

Offline-first tasks and habit tracking. Mobile-only PWA, single user, syncs to a small
self-hosted server.

```
app/      SvelteKit 2 + Svelte 5 PWA, RxDB over IndexedDB
server/   Hono + node:sqlite sync backend
```

## Running it

```bash
pnpm install
pnpm dev          # app on :5173, sync server on :5178
```

The app proxies `/sync` to the server in both dev and preview, so no config is needed
locally. Open the app on your phone via `pnpm --filter app dev --host`.

```bash
pnpm build        # static bundle in app/build/
pnpm --filter server start
```

`app/build/` is a plain static directory — host it anywhere. Point **Settings → Sync →
Server URL** at wherever the sync server lives (e.g. `https://api.example.com/sync`); the
server sets permissive CORS, so a cross-origin deployment works.

The database file defaults to `server/data/tohab.sqlite`, overridable with `TOHAB_DB`.
`PORT` overrides the server port.

## Tests

```bash
pnpm test               # pure logic: streak math, quick-add parser (45 assertions)
pnpm test:integration   # sync protocol, RxDB replication, headless-browser smoke test
```

The integration suite needs the sync server running, and the browser smoke test needs the
app running plus Chrome at the standard macOS path (override with `CHROME` / `APP`).

## What's in it

**Tasks** — quick add with natural-language parsing, due dates, Today / Upcoming / All /
Done views, four priorities, projects, notes, swipe to complete or delete.

**Habits** — binary and quantity habits, three schedule kinds (daily, chosen weekdays,
N× per week), schedule-aware streaks, a 12-week heatmap you can tap to backfill, per-habit
stats, archiving.

**Platform** — installable PWA that works fully offline, sync status indicator, dark mode,
JSON export/import, haptics.

### Quick-add syntax

| Input | Result |
| --- | --- |
| `today`, `tomorrow`, `friday`, `next mon` | relative and weekday dates |
| `in 3 days`, `in 2 weeks`, `in 1 month` | offsets |
| `5 jan`, `jan 5`, `25/12`, `25/12/2027` | explicit dates (day-first) |
| `5pm`, `at 9`, `14:30`, `9:30am` | times; a bare time implies today |
| `p1`–`p4` or `!1`–`!4` | priority |
| `#work` | project, created on demand if new |

`buy oat milk tomorrow 5pm p1 #groceries` → title "buy oat milk", due tomorrow 17:00,
priority 1, in the Groceries project.

## How sync works

Each collection replicates independently through RxDB's replication protocol against three
endpoints:

- `GET /sync/pull?collection=&cursor=&id=&limit=` → `{ documents, checkpoint }`
- `POST /sync/push` → array of conflicting master documents
- `GET /sync/events` → SSE; a `change` event tells clients to re-pull

Two decisions worth knowing:

**Checkpoints ride on a server-owned revision counter, not timestamps.** Every write gets
`rev = max(rev) + 1` for that user, and pull cursors page through `(rev, id)`. A device
with a skewed clock therefore can never make the cursor jump past documents it hasn't
received.

**Timestamps are kept in two places, deliberately.** Each document carries `updatedAt` from
the writing device's clock; it replicates as data and is what conflict detection compares.
The server additionally stamps `received_at` from its own clock on every write, which gives
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

`received_at` is server-side metadata and is not replicated to clients, so it never has to
satisfy an RxDB schema.

**Conflicts are last-write-wins, gated on `assumedMasterState`.** A push is rejected if the
document exists on the server and the client's assumed `updatedAt` doesn't match the
current one; the server returns the master document and RxDB resolves locally. A blind
insert over an existing document is treated as a conflict rather than an overwrite.

Deletes are soft — `_deleted: true` tombstones replicate like any other change, so a delete
on one device removes the document on the others.

Every row is scoped by an `x-user-id` header, which currently holds a device-generated id
kept in `localStorage`. There is no authentication: anyone who can reach the server can
read and write any user's data by setting that header. Fine on a private network or behind
a tunnel; add real auth before exposing it publicly.

## Notes and limits

- **No reminders/notifications.** iOS only delivers Web Push to an installed home-screen
  PWA and it needs a server with VAPID keys, so it was left out.
- **No recurring tasks.** Deliberately deferred — recurrence plus timezones is where task
  apps accumulate their worst bugs.
- **`navigator.vibrate` is a no-op on iOS Safari,** so haptics land on Android only. The
  CSS press states carry the feedback everywhere.
- **Habit streaks honour backfilled history.** The streak floor follows the earliest logged
  day, not the habit's creation date, so filling in the heatmap retroactively works.
- **Mobile only by design** — the layout caps at `max-w-lg` and centres on wider screens
  rather than adapting to desktop.
