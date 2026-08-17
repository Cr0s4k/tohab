# Tohab

Offline-first tasks and habit tracking. Mobile-only PWA, single user, syncs to a small
self-hosted server.

```
app/      SvelteKit 2 + Svelte 5 PWA, RxDB over IndexedDB
server/   Hono + Drizzle over Postgres sync backend
```

## Running it

```bash
pnpm install
pnpm dev          # starts Postgres, app on :5173, sync server on :5178
```

`dev` brings up Postgres in Docker and pushes the schema before starting the server. If you
already run Postgres elsewhere, set `DATABASE_URL` and skip the container.

The app proxies `/sync` to the server in both dev and preview, so no config is needed
locally. Open the app on your phone via `pnpm --filter app dev --host`.

```bash
pnpm build        # static bundle in app/build/
pnpm --filter server start
```

### Deploying with Docker Compose

The whole stack — Postgres, the sync server, and nginx serving the built PWA — comes up from
the root `docker-compose.yml`:

```bash
cp .env.example .env   # set at least POSTGRES_PASSWORD, optionally WEB_PORT
docker compose up -d --build
```

The app is then on `http://<host>:8080` and needs no sync configuration: nginx serves the
static bundle and proxies `/sync` to the server container, so the default relative
`/sync` server URL works as-is. Buffering is off on that location so the SSE change stream
passes through untouched.

`Dockerfile` is multi-stage with two targets: `web` (nginx + `app/build/`) and `server`
(Node, which runs `drizzle-kit push` against Postgres before starting so a fresh volume
gets its schema). Compose builds both; the `server` container is never published directly,
only reached through `web`.

Postgres keeps its data in the `tohab-pgdata` volume. The `db` port is published for local
`drizzle-kit studio` work — drop the `ports` block on a shared host, and remember the sync
server still has no authentication, so keep the published port behind a VPN or tunnel.

### Database

Postgres 18, defined in `docker-compose.yml` for local work. Tables live in
`server/src/schema.ts` and are applied with `drizzle-kit push`. There are no migration files
yet — while the schema is still moving, the workflow is to edit `schema.ts` and re-push:

```bash
pnpm db:up                       # start Postgres
pnpm --filter server db:push     # apply schema.ts
pnpm db:reset                    # destroy the volume and rebuild from schema.ts
pnpm --filter server db:studio   # browse the data
```

Compose reads the credentials from `.env` (defaulting to `tohab`/`tohab`); `pnpm dev` does
not, so if you change `POSTGRES_PASSWORD` also export a matching `DATABASE_URL` for local
work.

If the schema ever needs to survive real data, swap `push` for `drizzle-kit generate` plus
`migrate()`. The server refuses to start against a database with no schema rather than
failing per-request.

`app/build/` is a plain static directory — host it anywhere. Point **Settings → Sync →
Server URL** at wherever the sync server lives (e.g. `https://api.example.com/sync`); the
server sets permissive CORS, so a cross-origin deployment works.

`DATABASE_URL` defaults to `postgresql://tohab:tohab@localhost:5432/tohab`. `PORT`
overrides the server port. The `pg` driver is pure JavaScript, so there is nothing to
compile and any managed Postgres works.

## Tests

```bash
pnpm test               # pure logic: streak math, quick-add parser, calendar feed (85 assertions)
pnpm test:integration   # sync protocol, concurrency, RxDB replication, browser smoke test
pnpm check              # typecheck app and server
```

The integration suite needs Postgres and the sync server running, and the browser smoke test
needs the app running plus Chrome at the standard macOS path (override with `CHROME` /
`APP`).

## What's in it

**Tasks** — a compose sheet behind the + button, natural-language parsing, due dates,
Today / Upcoming / All / Done views, four priorities, projects, notes, swipe to complete or
delete.

**Habits** — binary and quantity habits, three schedule kinds (daily, chosen weekdays,
N× per week), schedule-aware streaks, a 12-week heatmap you can tap to backfill, per-habit
stats, archiving.

**Platform** — installable PWA that works fully offline, sync status indicator, dark mode,
JSON export/import, haptics.

### Adding a task

The + button opens a bottom sheet: title, notes, and chips for date, priority and project,
each expanding into a picker. It stays open after adding so several tasks can go in one
after another, and Done or Escape dismisses it.

The chips are two views of the same fields, so typing quick-add syntax in the title fills
them in live, and tapping a chip overrides whatever the parser found for that one field.

| Input | Result |
| --- | --- |
| `today`, `tomorrow`, `friday`, `next mon` | relative and weekday dates |
| `in 3 days`, `in 2 weeks`, `in 1 month` | offsets |
| `5 jan`, `jan 5`, `25/12`, `25/12/2027` | explicit dates (day-first) |
| `5pm`, `at 9`, `14:30`, `9:30am` | times; a bare time implies today |
| `p1`–`p4`, `!1`–`!4` or `!!1`–`!!4` | priority |
| `#work` | project, created on demand if new |

`buy oat milk tomorrow 5pm p1 #groceries` → title "buy oat milk", due tomorrow 17:00,
priority 1, in the Groceries project.

### Calendar feed

Settings → Calendar feed reveals a subscription URL you can add to Google Calendar (Other
calendars → From URL) or iOS Calendar. Open tasks with a due date become events: timed tasks
get a 30-minute block with a `VALARM` reminder, date-only tasks become all-day events.
Completed tasks are excluded, and a task's project becomes the event's category.

```
GET /calendar/token                    → { token }   (identified by x-user-id)
GET /calendar/<token>/tohab.ics?alarm=10
```

- The URL carries an HMAC of your sync id, never the id itself. Feed URLs get handed to
  Google and live in its history indefinitely, and the sync id is the only credential the
  sync API has — so a leaked feed URL must not become write access to your data. The HMAC
  key comes from `CALENDAR_SECRET`, or is generated once and stored in the `secrets` table.
- `alarm` is the reminder lead time in minutes, baked into the URL by the settings screen.
  `alarm=0` omits alarms. Only timed tasks get one: relative alarms on all-day events fire
  at midnight in most clients, which is noise rather than a reminder.
- Times are emitted as floating local wall-clock — no `TZID`, no `Z`. Tohab stores what the
  device's calendar showed with no zone attached, so 9am stays 9am wherever it is read.
- Anyone holding the URL can read your tasks, and the server must be reachable from the
  internet for a hosted calendar to fetch it.

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

Every row is scoped by an `x-user-id` header, which currently holds a device-generated id
kept in `localStorage`. There is no authentication: anyone who can reach the server can
read and write any user's data by setting that header. Fine on a private network or behind
a tunnel; add real auth before exposing it publicly.

## Notes and limits

- **Reminders ride on the calendar feed, not on push.** Alarms are `VALARM` entries the
  subscribed calendar app fires, which needs no VAPID keys and works on every device — but
  the lead time is per-feed rather than per-task, only timed tasks get one, and delivery is
  as prompt as the calendar client's refresh (Google polls a feed roughly hourly).
- **No in-app notifications.** iOS only delivers Web Push to an installed home-screen PWA
  and it needs a server with VAPID keys, so it was left out.
- **No recurring tasks.** Deliberately deferred — recurrence plus timezones is where task
  apps accumulate their worst bugs.
- **`navigator.vibrate` is a no-op on iOS Safari,** so haptics land on Android only. The
  CSS press states carry the feedback everywhere.
- **Habit streaks honour backfilled history.** The streak floor follows the earliest logged
  day, not the habit's creation date, so filling in the heatmap retroactively works.
- **Mobile only by design** — the layout caps at `max-w-lg` and centres on wider screens
  rather than adapting to desktop.
- **The server needs Postgres**, so it is no longer a zero-dependency binary you can drop
  anywhere; local work goes through Docker.
