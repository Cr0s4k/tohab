# Tohab

Offline-first daily action journal for tasks and habits. Mobile-only PWA, single account, syncs
to a small self-hosted server.

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
mkdir -p secrets && printf '%s\n' 'strong-password' > secrets/postgres_password
cp .env.example .env   # optionally set WEB_PORT to a private address
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

Postgres keeps its data in the `tohab-pgdata` volume and takes its password from the
`postgres_password` Docker secret (`${TOHAB_SECRETS_DIR}/postgres_password`), never an
environment variable. The `db` port binds to `127.0.0.1` by default — kept only for local
`drizzle-kit studio` work — so it is not reachable from the network and stays off the
direct route around the sync server's authentication. `web` binds loopback by default too;
set `WEB_PORT` to a private address (e.g. `<tailscale-ip>:8080`) to expose it on Tailscale.

The optional GitHub Actions deployment workflow reads `KOMODO_WEBHOOK_URL` and
`KOMODO_WEBHOOK_SECRET` from repository Actions secrets. Configure both in GitHub;
if either is missing, the workflow skips deployment. Keep deployment URLs and
signing keys out of tracked files.

For Web Push, set `VAPID_SUBJECT` to a real contact identity such as
`https://tohab.example.com` or `mailto:admin@example.com`. Apple Push rejects `localhost`
and `.local` identities with `403 BadJwtToken`, even though the same subscription flow can
work on desktop push services. Compose forwards this value to the server; changing it does
not rotate the persisted VAPID key pair or require clients to re-subscribe.

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
Server URL** at wherever the sync server lives (e.g. `https://api.example.com/sync`). A
cross-origin deployment additionally needs `ALLOWED_ORIGINS` set to the app's origin, since
the session cookie cannot be sent to a wildcard origin — and, being `Secure`, needs HTTPS on
both sides. Serving both from one origin (what `docker-compose` does) avoids all of that.

`DATABASE_URL` defaults to `postgresql://tohab:tohab@localhost:5432/tohab`. `PORT`
overrides the server port. The `pg` driver is pure JavaScript, so there is nothing to
compile and any managed Postgres works.

## Tests

```bash
pnpm test:unit          # server calendar and push unit tests
pnpm test               # pure logic: streak math, quick-add parser, recurrence,
                        # task arranging, activity log and undo, calendar feed
pnpm test:integration   # sync protocol, concurrency, RxDB replication, browser smoke test
pnpm check              # typecheck app and server
```

`test/activity-e2e.test.ts` is the odd one out: it drives the real `tasks.ts` and `habits.ts`
against an in-memory RxDB to check that every recorded action can actually be undone. Node
runs them through `test/activity-e2e.hooks.mjs`, which points `db/lazy.ts` at that in-memory
database and stubs the `$state` rune, so no browser or server is involved.

The integration suite needs Postgres and the sync server running, and the browser smoke test
needs the app running plus Chrome at the standard macOS path (override with `CHROME` /
`APP`). Because registration closes after the first account, the integration tests create
their accounts directly in Postgres via `server/test/helpers.ts` and then sign in over HTTP;
they delete every `@test.invalid` account and its documents afterwards, so a run leaves
registration exactly as it found it.

## What's in it

**Tasks** — quick capture with natural-language parsing, due dates, recurrence, Today / Upcoming /
Inbox views, four priorities, projects, notes, overdue carry-over to tomorrow or a chosen date,
and swipe to complete or delete. Completed work stays out of the daily list unless you turn on
“Show completed tasks”.

**Habits** — binary and quantity habits, three schedule kinds (daily, chosen weekdays,
N× per week), schedule-aware streaks, a 12-week heatmap you can tap to backfill, per-habit
stats, archiving, and pause windows that skip planned time without breaking history.

**Platform** — installable portrait PWA that works fully offline, sync status and recovery,
dark mode, JSON export/import, haptics, optional Web Push reminders and app badging, and an
activity history with immediate undo for destructive actions.

### Adding a task

The + button opens a quick-capture sheet with a title and chips for date, priority, project,
repeat and reminders, each expanding into a picker. It stays open after adding so several tasks
can go in one after another, and Done or Escape dismisses it.

The chips are two views of the same fields, so typing quick-add syntax in the title fills
them in live, and tapping a chip overrides whatever the parser found for that one field.

| Input | Result |
| --- | --- |
| `today`, `tomorrow`, `friday`, `next mon` | relative and weekday dates |
| `in 3 days`, `in 2 weeks`, `in 1 month` | offsets |
| `5 jan`, `jan 5`, `25/12`, `25/12/2027` | explicit dates (day-first) |
| `5pm`, `at 9`, `14:30`, `9:30am` | times; a bare time implies today |
| `every day`, `every other friday`, `every 3 weeks`, `every 15th` | recurrence |
| `p1`–`p4`, `!1`–`!4` or `!!1`–`!!4` | priority |
| `#work` | project, created on demand if new |

`buy oat milk tomorrow 5pm p1 #groceries` → title "buy oat milk", due tomorrow 17:00,
priority 1, in the Groceries project.

### A daily pass

Today is the working surface: overdue tasks are called out with a default “Move to tomorrow”
action and an optional destination date, Today also shows a compact habit completion summary,
and the bottom “What remains today?” prompt gives a quick wrap-up without turning the app into a
long-term archive. Every carry-over, delete, completion, and habit log can be undone immediately.

To pause a habit, open it from Progress, choose a date under “Take a pause”, and save. The pause
starts today and ends on the selected date; paused days are omitted from due counts and streak
gaps, while earlier entries remain intact. “Resume now” clears the window.

### Activity history

**Browse → Activity** lists what you have changed, newest first and grouped by day: tasks
and projects added, edited, completed or deleted, habits created or archived, days logged or
cleared. The history is read-only; undo is available only from the immediate toast after an
action.

Each entry stores the documents the action touched, `before` and `after`, as a JSON blob on
the entry itself. Undoing is then the same operation for every kind of action — upsert every
`before` that existed, remove every document that did not — which is why one code path
covers a task edit and a project delete that moved eleven tasks to the Inbox alike. The
immediate undo toast uses this path to restore an action.

Reverting marks the entry rather than adding a new one, and an entry is revertible once. An
undone entry stays in the list, struck through, because a history that quietly rewrites
itself is worse at answering "what did I do?" than one that does not.

Two consequences worth knowing:

- **The log is capped at 200 entries.** It replicates like every other collection, so an
  unbounded one would grow forever and be pushed forever; the oldest entries are dropped
  once the cap is passed. Repeated taps on the same thing within ten seconds — a habit
  counter climbing to eight — fold into one entry rather than eight, keeping both the cap
  and the list useful.
- **Undo restores documents, not the world around them.** It writes the old document back
  with a fresh `updatedAt`, so it is an ordinary last-write-wins change like any other. If
  another device edited the same task in the meantime, undoing here overwrites that edit.

Entries are per account, not per device, so the history covers everything you did anywhere.
**Clear** empties it without touching the tasks and habits it describes.

### Repeating tasks

A task can carry a recurrence rule, set from the Repeat chip or by typing one. Completing it
does not file it away: the due date moves to the next occurrence and the task stays open, so
the series *is* the task and there is one row for it rather than a graveyard of instances.

`daily`, `weekly`, `monthly` and `yearly` work as bare words, and `every …` takes an
interval (`every 3 days`, `every other week`), weekdays (`every friday`, `every mon, wed and
fri`, `every weekday`, `every weekend`) or a day of the month (`every 15th`). Todoist's
`every!` is supported too: `every! 10 days` counts from the day you complete it rather than
the day it was due, for the chores whose clock starts when you finish.

Rules are stored on the task as one string — `[!]unit:interval[:extra]`, so `week:2:1` is
every other Monday. `app/src/lib/repeat.ts` owns the format, the descriptions the UI shows,
and the date arithmetic; `app/test/repeat.test.ts` covers it.

Two behaviours worth knowing. Completing an overdue repeating task rolls forward past today
rather than to a date already gone, so a daily task ignored for three weeks lands tomorrow.
And month-length overflow clamps rather than skips: `every 31st` falls on 28 February and is
back on the 31st in March.

Recurrence and Habits overlap on purpose but stay separate: recurrence is for dated work with
a next occurrence (bins, rent, filters), Habits are for things measured as a streak.

### Calendar feed

Settings → Calendar feed reveals a subscription URL you can add to Google Calendar (Other
calendars → From URL) or iOS Calendar. Open tasks with a due date become events: timed tasks
get a 30-minute block and date-only tasks become all-day events. Completed or deleted events
remain as short-lived cancellation tombstones so polling calendar clients remove their prior
copies, and a task's project becomes the event's category. A repeating task becomes one event
with an `RRULE`, so the whole series shows up rather than only its next occurrence. The feed is
schedule-only; Tohab Web Push owns reminders so calendar clients do not produce duplicates.

```
GET /calendar/token                    → { token, feedUrl? }   (requires a session)
GET /calendar/<token>/tohab.ics
```

- The URL carries an HMAC of your sync id, never the id itself. Feed URLs get handed to
  Google and live in its history indefinitely, and the sync id is the only credential the
  sync API has — so a leaked feed URL must not become write access to your data. The HMAC
  key comes from `CALENDAR_SECRET`, or is generated once and stored in the `secrets` table.
- Set `CALENDAR_PUBLIC_BASE_URL` when the private application origin cannot be reached by a
  hosted calendar service. For example, `https://calendar.example.com/calendar` makes the
  authenticated token endpoint return that public origin while the application stays private.
- `CALENDAR_TOMBSTONE_RETENTION_DAYS` controls how long deleted or completed events remain in
  the polling feed as `STATUS:CANCELLED`; it defaults to 90 days.
- `every!` rules deliberately get no `RRULE`. They count from whenever the task is actually
  completed, so no fixed schedule describes them and only the current due date is known.
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

All three require a session cookie and answer `401` without one.

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

### Authentication

One account per server. `POST /auth/register` works until the first account exists and is
`403` forever after, so the deployment belongs to whoever claims it first. Passwords are
`scrypt` hashes; `GET /auth/state` tells a cold client whether to show sign-up or sign-in.

The session is an `httpOnly`, `SameSite=Lax`, `Secure`-when-HTTPS cookie holding
`userId.expiry.hmac`, signed with a key in the `secrets` table and good for a year. Nothing
is stored per session, so there is no session table to expire — the trade is that a leaked
cookie stays valid until it expires; deleting the `session` row from `secrets` invalidates
every session at once. `/sync/*` and `/calendar/token` require it; the `.ics` feed does not,
because a calendar client cannot sign in and its unguessable token is the credential.

A cookie rather than a token in `localStorage`: the API is same-origin with the app in every
deployment here (nginx in production, the Vite proxy in dev), so the cookie needs no CORS
work, cannot be read by script if the page is ever XSS'd, and — the practical part — rides
along on `EventSource`, which cannot send headers and previously took the user id in its
query string.

Being offline-first, the app cannot ask the server who you are at launch, so a non-secret
`tohab.session` record in `localStorage` holds the signed-in id and email. That is what
renders the right screen offline and scopes the local database; the cookie remains the only
thing the server trusts. If it has expired, sync pauses with a visible warning while the
local data stays usable and editable until the person signs out and in again.

Each normalized `sync server URL + account id` selects a separate physical RxDB. Existing
installations retain their original database, and changing server/account no longer deletes
unsynchronised data or risks uploading it under another owner.

## Notes and limits

- **Reminders use Web Push only.** Each device can enable an automatic default for timed tasks,
  and a task can inherit it, disable its reminder, fire at the due time, or choose a custom lead.
  iPhone/iPad require the Home Screen app. The server generates one P-256 VAPID pair atomically
  in the `secrets` table, stores authenticated per-device subscriptions, scans timed open tasks
  in each subscription's IANA timezone, and records each delivered occurrence so restarts do
  not duplicate it. Permanent 404/410 endpoints are removed automatically. Subscription
  endpoints and keys must never be logged or exposed.
- **Badging is capability-detected.** Supported installed apps show the current open-task count;
  unsupported browsers simply ignore it.
- **iOS haptics are preserved.** Android uses `navigator.vibrate`; iOS receives the existing
  switch-control overlay workaround plus CSS press states.
- **Portrait is intentional.** The manifest remains locked to portrait as a product choice.
- **Habit streaks honour backfilled history.** The streak floor follows the earliest logged
  day, not the habit's creation date, so filling in the heatmap retroactively works.
- **Mobile only by design** — the layout caps at `max-w-lg` and centres on wider screens
  rather than adapting to desktop.
- **The server needs Postgres**, so it is no longer a zero-dependency binary you can drop
  anywhere; local work goes through Docker.
