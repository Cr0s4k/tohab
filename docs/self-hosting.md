# Self-hosting

Tohab is one account per server: `POST /auth/register` works until the first account exists
and is closed forever after, so the deployment belongs to whoever signs up first. Do that
before exposing it anywhere.

## Docker Compose

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

## Configuration

Compose reads these from `.env`; `.env.example` documents each one.

| Variable | Default | Purpose |
| --- | --- | --- |
| `WEB_PORT` | `127.0.0.1:8080` | Host binding for the app |
| `POSTGRES_USER`, `POSTGRES_DB` | `tohab` | Database credentials |
| `POSTGRES_PORT` | `127.0.0.1:5432` | Host binding for Postgres |
| `TOHAB_SECRETS_DIR` | `./secrets` | Directory holding the `postgres_password` file |
| `VAPID_SUBJECT` | — | Contact identity for Web Push, see below |
| `CALENDAR_SECRET` | generated | Signs calendar feed URLs |
| `CALENDAR_PUBLIC_BASE_URL` | — | Public origin for the calendar feed |
| `CALENDAR_TOMBSTONE_RETENTION_DAYS` | `90` | How long cancelled events stay in the feed |
| `ALLOWED_ORIGINS` | — | Only for an app served from another origin |

Running the server outside Compose, `DATABASE_URL` defaults to
`postgresql://tohab:tohab@localhost:5432/tohab` and `PORT` overrides the server port. The `pg`
driver is pure JavaScript, so there is nothing to compile and any managed Postgres works.

## Web Push

Set `VAPID_SUBJECT` to a real contact identity such as `https://tohab.example.com` or
`mailto:admin@example.com`. Apple Push rejects `localhost` and `.local` identities with
`403 BadJwtToken`, even though the same subscription flow can work on desktop push services.
Compose forwards this value to the server; changing it does not rotate the persisted VAPID key
pair or require clients to re-subscribe.

## Calendar feed

Hosted calendar services such as Google fetch the feed from their own servers, so the
`/calendar/<token>/tohab.ics` route must be reachable from the internet. If the app itself
stays private, set `CALENDAR_PUBLIC_BASE_URL` to a public origin that routes to it, including
the `/calendar` path — for example `https://calendar.example.com/calendar`. The authenticated
token endpoint then hands out feed URLs on that origin.

Feed URLs are signed with `CALENDAR_SECRET`, or with a key generated once and stored in
Postgres. Set it explicitly to keep feed URLs identical across a database reset.

## Hosting the app separately

`app/build/` is a plain static directory — host it anywhere. Point **Settings → Sync & account →
Server URL** at wherever the sync server lives (e.g. `https://api.example.com/sync`). A
cross-origin deployment additionally needs `ALLOWED_ORIGINS` set to the app's origin, since
the session cookie cannot be sent to a wildcard origin — and, being `Secure`, needs HTTPS on
both sides. Serving both from one origin (what Docker Compose does) avoids all of that.

## Automatic deploys

`.github/workflows/deploy.yml` triggers a Komodo redeploy on every push to
`main`. It reads `KOMODO_WEBHOOK_URL` and `KOMODO_WEBHOOK_SECRET` from repository Actions
secrets and skips the deploy when either is missing, so forks are unaffected. The webhook URL
must be reachable from GitHub's runners. Keep deployment URLs and signing keys out of tracked
files.
