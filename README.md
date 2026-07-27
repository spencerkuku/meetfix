# MeetFix

Room booking and facility repair tracking for a single school. See [`CONTEXT.md`](./CONTEXT.md) for domain vocabulary and [`docs/adr/`](./docs/adr/) for the architectural decisions behind this build.

## Architecture

- `backend/` — NestJS REST API, PostgreSQL via Prisma.
- Front-end (repo root) — the existing React/Vite SPA.
- Deployment — a single `docker-compose` stack: `api` (NestJS), `postgres`, and `caddy` (reverse proxy, automatic HTTPS).

## Running the full stack (Docker)

1. Copy the env template and fill in a real password:
   ```bash
   cp .env.example .env
   ```
2. Start everything:
   ```bash
   docker compose up -d --build
   ```
   This builds the API image, runs pending Prisma migrations automatically on container start, and brings up Postgres and Caddy.
3. Check it's alive:
   ```bash
   curl -sk https://localhost/health
   ```
   `{"status":"ok"}` means Caddy → API → Postgres are all reachable.

### Environment variables

Set in `.env` at the repo root (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Database credentials, shared between `postgres` and `api` |
| `SITE_ADDRESS` | Domain Caddy serves and auto-provisions HTTPS for. Leave as `localhost` for local dev (plain HTTP/local cert); set to your school's real domain in production (e.g. `meetfix.your-school.edu.tw`) and Caddy will automatically obtain and renew a Let's Encrypt certificate — just make sure the domain's DNS points at this host and ports 80/443 are reachable from the internet. |
| `VITE_API_URL` | Where the front-end dev server finds the API. Not used by `docker compose` itself (Caddy handles routing there) — only needed when running the Vite dev server locally. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From Google Cloud Console (APIs & Services → Credentials), used for Google Workspace login. |
| `GOOGLE_CALLBACK_URL` | Must exactly match the redirect URI registered in Google Cloud Console, e.g. `https://meetfix.your-school.edu.tw/auth/google/callback`. |
| `SCHOOL_GOOGLE_DOMAIN` | The Google Workspace domain allowed to log in — everything else is rejected. |
| `FRONTEND_URL` | Public URL of the front end; Google login redirects back here after authenticating. |
| `JWT_SECRET` | Signs session tokens — generate with `openssl rand -hex 32`. |
| `ENCRYPTION_KEY` | 32-byte hex key that encrypts stored Google refresh tokens at rest — generate with `openssl rand -hex 32`. |

Uploaded files (room and repair-ticket photos) live on a Docker volume (`uploads`) mounted into the API container at `/app/uploads`, served back out at `/uploads/*` via Caddy — see ADR-0004.

### Stopping / resetting

```bash
docker compose down          # stop, keep data
docker compose down -v       # stop and wipe the database volume
```

## Backend development (without Docker)

```bash
cd backend
npm install
cp .env.example .env   # then point DATABASE_URL at a local Postgres
npx prisma migrate dev   # applies/creates migrations against your DATABASE_URL
npm run start:dev
```

### Tests

Tests run against a real PostgreSQL database (no mocked Prisma/DB layer) — see the testing decision in the project spec. Point `backend/.env`'s `DATABASE_URL` at a disposable Postgres instance (a local Docker container is fine) before running:

```bash
cd backend
npm run test        # unit tests
npm run test:e2e    # HTTP-boundary tests against a real database
```

### Database migrations

Schema changes go through Prisma migrations only — never edit the database by hand:

```bash
cd backend
npx prisma migrate dev --name <describe-the-change>
```

Migration files are committed to `backend/prisma/migrations/` and applied automatically in production via `prisma migrate deploy`, which runs on every container start (see `backend/docker-entrypoint.sh`).
