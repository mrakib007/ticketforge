# TicketForge

A learning-oriented, production-inspired ticketing platform. **Step 1 is only the foundation:** no events, bookings, payments or login yet. One Git repository contains two independently runnable applications and a shared contracts package.

## Requirements

- Node.js **24 LTS**, Corepack and pnpm **10.28.2** (`corepack pnpm` also works without a global pnpm binary).
- Docker Desktop with Compose v2, running, for local PostgreSQL, Redis, Kafka and the container-backed test.
- Free local ports **3000**, **3001**, **5432**, **6379**, **9092** (configurable infrastructure ports in `.env`).

## Get running

From the repository root:

```bash
corepack pnpm install
cp .env.example .env
cp .env.example apps/api/.env
docker compose up -d
docker compose ps
corepack pnpm dev
```

Windows PowerShell equivalents for the two copy commands: `Copy-Item .env.example .env` and `Copy-Item .env.example apps/api/.env`.

Open **http://127.0.0.1:3000**. The page checks the Fastify API on the server and shows PostgreSQL readiness. Visit **http://127.0.0.1:3001/health/live** (process alive) and **http://127.0.0.1:3001/health/ready** (database reachable). Until PostgreSQL is available, live returns `200` and ready returns `503`; the UI safely says unavailable. The API can start before PostgreSQL and will report readiness as soon as the DB comes online.

`corepack pnpm dev` starts both apps; use `corepack pnpm --filter @ticketforge/api dev` and `corepack pnpm --filter @ticketforge/web dev` in separate terminals if preferred. To stop infrastructure: `docker compose down`. To **delete local service data**, explicitly run `docker compose down -v` (destructive).

## Commands

| Command                                   | Purpose                                                           |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `corepack pnpm install --frozen-lockfile` | Reproducible install from committed lockfile                      |
| `corepack pnpm dev`                       | Both apps, watch mode                                             |
| `corepack pnpm test`                      | API injection/config and frontend fetch tests; no Docker required |
| `corepack pnpm test:db`                   | Real PostgreSQL Testcontainers integration test; requires Docker  |
| `corepack pnpm typecheck`                 | Both strict TypeScript projects                                   |
| `corepack pnpm lint`                      | Both ESLint projects                                              |
| `corepack pnpm format:check`              | Check Prettier formatting                                         |
| `corepack pnpm format`                    | Apply Prettier formatting                                         |
| `corepack pnpm build`                     | Build API and web production artifacts                            |
| `docker compose ps`                       | View infrastructure health                                        |
| `docker compose logs -f kafka`            | Inspect Kafka initialization                                      |

## Environment

`.env.example` documents every supported variable. Docker Compose reads **root `.env`**; the API reads **`apps/api/.env`** via Node's env-file support. Next.js uses `API_INTERNAL_URL` on its server, defaulting to `http://127.0.0.1:3001`; set `apps/web/.env.local` only if your API address differs. Never set `NEXT_PUBLIC_DATABASE_URL` or pass the database URL to a browser component.

For **local PostgreSQL**, use the example `DATABASE_URL`, `DB_SSL=false`, and Compose. For **Supabase**, set a PostgreSQL connection string in `apps/api/.env`, set `DB_SSL=true`, and use a connection endpoint reachable from your machine (Supabase's pooler can be necessary for IPv4-only networks). TLS certificate verification stays enabled. Keep DB pool size small if using a hosted provider; the API needs no other Supabase services. Note that `pg` connection URL `sslmode` parameters can override `ssl` settings: prefer a plain connection URL and `DB_SSL=true` instead. The local environment does not require Supabase.

## Repository map

```text
apps/web/                 Next.js App Router UI (server-side API health fetch)
apps/api/                 Fastify modular monolith (health module, pg pool)
packages/contracts/       Shared API response types (no secrets)
database/migrations/      Reserved for SQL migrations in a later step
database/seeds/           Reserved for future seeds
infrastructure/           Local infrastructure notes
docs/architecture/        Architecture decisions and alternatives
docker-compose.yml        Local PostgreSQL, Redis, Kafka (single-node KRaft)
```

See [`docs/architecture/foundation.md`](docs/architecture/foundation.md) for why the pieces fit together this way, alternatives, and trade-offs.
