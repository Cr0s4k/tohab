# Development

```
app/      SvelteKit 3 + Svelte 5 PWA, RxDB over IndexedDB
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

## Database

Postgres 18, defined in `docker-compose.yml`. Tables live in `server/src/schema.ts` and are
applied with `drizzle-kit push`. There are no migration files yet — while the schema is still
moving, the workflow is to edit `schema.ts` and re-push:

```bash
pnpm db:up                       # start Postgres
pnpm --filter server db:push     # apply schema.ts
pnpm db:reset                    # destroy the volume and rebuild from schema.ts
pnpm --filter server db:studio   # browse the data
```

Compose reads the credentials from `.env` (defaulting to `tohab`/`tohab`); `pnpm dev` does
not, so if you change the Postgres password also export a matching `DATABASE_URL` for local
work.

If the schema ever needs to survive real data, swap `push` for `drizzle-kit generate` plus
`migrate()`. The server refuses to start against a database with no schema rather than
failing per-request.

## Tests

```bash
pnpm test:unit          # server calendar and push unit tests
pnpm test               # pure logic: streak math, quick-add parser, recurrence,
                        # task arranging, activity log and undo, calendar feed
pnpm test:integration   # sync protocol, concurrency, RxDB replication, browser smoke test
pnpm check              # typecheck app and server
```

`app/test/activity-e2e.test.ts` is the odd one out: it drives the real `tasks.ts` and
`habits.ts` against an in-memory RxDB to check that every recorded action can actually be
undone. Node runs them through `app/test/activity-e2e.hooks.mjs`, which points `db/lazy.ts`
at that in-memory database and stubs the `$state` rune, so no browser or server is involved.

The integration suite needs Postgres and the sync server running, and the browser smoke test
needs the app running plus Chrome at the standard macOS path (override with `CHROME` /
`APP`). Because registration closes after the first account, the integration tests create
their accounts directly in Postgres via `server/test/helpers.ts` and then sign in over HTTP;
they delete every `@test.invalid` account and its documents afterwards, so a run leaves
registration exactly as it found it.
