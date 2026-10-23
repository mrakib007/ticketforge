# TicketForge

A learning-oriented, production-inspired ticketing platform with an event catalogue, email/password accounts, capacity-based ticket bookings, organizer-owned event management, and fictional cinema seat reservations. There is no payment processing or paid ticket issuing. One Git repository contains two independently runnable applications and a shared contracts package.

## Requirements

- Node.js **24 LTS** and npm **11.9.0** (included with Node.js 24.14.0).
- Docker Desktop with Compose v2, running, for local PostgreSQL, Redis, Kafka and the container-backed test.
- Chromium for browser tests: run `npx playwright install chromium` once after installing dependencies.
- Free local ports **3000**, **3001**, **5432**, **6379**, **9092** (configurable infrastructure ports in `.env`).

## Get running

First-time setup from the repository root:

```bash
npm ci
cp .env.example .env
cp .env.example apps/api/.env
docker compose up -d
docker compose ps
npm run db:deploy
npm run db:seed
npm run dev
```

Windows PowerShell equivalents for the two copy commands: `Copy-Item .env.example .env` and `Copy-Item .env.example apps/api/.env`.

After a reboot, start Docker Desktop (or the Docker daemon), then run from the repository root:

```bash
docker compose up -d
docker compose ps
npm run db:deploy
npm run dev
```

Keep the existing `.env` and `apps/api/.env` files; copying the examples again would overwrite your local credentials. Run `npm ci` after dependency or lockfile changes (or if `node_modules` is missing). `db:deploy` is safe to repeat and applies only pending migrations. `db:seed` is optional and adds two sample published events without duplicating them on repeated runs. On local databases outside production, it also creates two demo accounts: `demo.alice@example.com` and `demo.bob@example.com`, both with password `DemoPassword2026!`. These are public test credentials; never use them for real accounts. Rerunning the seed does not reset existing passwords. Demo users are skipped for non-local databases and in production.

If Compose cannot bind port `5432` because another PostgreSQL instance is using it, choose a free `POSTGRES_PORT` in the root `.env` (for example, `5433`) and change the port in `DATABASE_URL` in `apps/api/.env` to match. Then rerun `docker compose up -d`. If you use a hosted database instead, keep its URL in `apps/api/.env`; the local PostgreSQL container is not needed for API readiness. Local seeding also creates a demo organizer as described below.

Open **http://127.0.0.1:3000**. The page checks the Fastify API on the server and shows PostgreSQL readiness. Browse **http://127.0.0.1:3000/events** for upcoming published events and select one for its details (times displayed in UTC). Create an account at **/register**, sign in at **/login**, book 1–10 tickets on an event page, and view your bookings at **/account**. The API exposes `GET /events` (up to 50 upcoming events, ordered by start) and `GET /events/:id` (published events only). Visit **http://127.0.0.1:3001/health/live** (process alive) and **http://127.0.0.1:3001/health/ready** (database reachable). Until PostgreSQL is available, live returns `200` and ready returns `503`; the UI safely says unavailable. The API can start before PostgreSQL and will report readiness as soon as the DB comes online.

`npm run dev` starts both apps; use `npm run dev -w @ticketforge/api` and `npm run dev -w @ticketforge/web` in separate terminals if preferred. To stop infrastructure: `docker compose down`. To **delete local service data**, explicitly run `docker compose down -v` (destructive). See **Organizer events** below for the additional local seeded organizer and the complete two-sided demo flow.

## Commands

| Command                                     | Purpose                                                           |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `npm ci`                                    | Reproducible install from committed lockfile                      |
| `npm run dev`                               | Both apps, watch mode                                             |
| `npm test`                                  | API injection/config and frontend fetch tests; no Docker required |
| `npm run test:db`                           | Real PostgreSQL Testcontainers integration test; requires Docker  |
| `npm run test:redis`                        | Real Redis rate-limit integration test; requires Docker           |
| `npm run test:e2e`                          | Isolated Chromium hold-flow tests; requires Docker and Chromium   |
| `npm run db:generate`                       | Generate Prisma Client after schema changes                       |
| `npm run db:validate`                       | Validate the Prisma schema                                        |
| `npm run db:migrate -- --name create_users` | Create/apply a development migration                              |
| `npm run db:deploy`                         | Apply committed migrations without creating new ones              |
| `npm run db:seed`                           | Add sample events and local-only demo users; safe to repeat       |
| `npm run db:status`                         | Show Prisma migration status                                      |
| `npm run db:studio`                         | Open Prisma's local database viewer                               |
| `npm run typecheck`                         | Both strict TypeScript projects                                   |
| `npm run lint`                              | Both ESLint projects                                              |
| `npm run format:check`                      | Check Prettier formatting                                         |
| `npm run format`                            | Apply Prettier formatting                                         |
| `npm run build`                             | Build API and web production artifacts                            |
| `docker compose ps`                         | View infrastructure health                                        |
| `docker compose logs -f kafka`              | Inspect Kafka initialization                                      |

## Environment

`.env.example` documents every supported variable. Docker Compose reads **root `.env`**; the API reads **`apps/api/.env`** via Node's env-file support. Next.js uses `API_INTERNAL_URL` on its server, defaulting to `http://127.0.0.1:3001`; set `apps/web/.env.local` only if your API address differs. Never set `NEXT_PUBLIC_DATABASE_URL` or pass the database URL to a browser component.

For **local PostgreSQL**, use the example `DATABASE_URL`, `DB_SSL=false`, and Compose. For **Supabase**, set a PostgreSQL connection string in `apps/api/.env`, set `DB_SSL=true`, and use a connection endpoint reachable from your machine. Set optional `DIRECT_URL` for Prisma CLI commands if migrations need a different, direct/session connection instead of the application's pooled URL. TLS certificate verification stays enabled. Keep DB pool size small if using a hosted provider; the API needs no other Supabase services. The PostgreSQL driver can override TLS options from URL parameters: prefer a plain connection URL and `DB_SSL=true` instead. The local environment does not require Supabase.

## Prisma and database changes

Prisma **7.10.1** is pinned for the CLI, client and PostgreSQL adapter. `npm ci`
generates the client automatically; generation needs neither Docker nor a database
connection. If you install with scripts disabled, run `npm run db:generate` manually.
Generated files are ignored by Git. The backend uses Prisma Client; the frontend
never imports it or accesses PostgreSQL directly.

The schema lives in `apps/api/prisma/schema.prisma`. The `Event` model stores title,
description, venue, UTC start and end timestamps, and publication state. A database
constraint requires the end to follow the start. `User` and `Session` store accounts and hashed session tokens. `Booking` stores the ticket quantity for an event and user; `Event` stores capacity and booked seats. Existing events receive zero capacity until explicitly configured (run `npm run db:seed` to give the two sample events 100 seats each).
Prisma Client handles both catalogue reads and the readiness query. Prisma uses the
`pg` driver internally via its adapter.

For a future schema change:

1. Update the Prisma schema.
2. Run `npm run db:migrate -- --name describe_change` against your **development** database.
3. Review and commit the generated SQL in `apps/api/prisma/migrations/`.
4. Run `npm run db:generate`, then tests and build.

`migrate dev` uses a shadow database and needs permission to create it (the local
Docker user has that permission). Never accept a database reset on important data.
Use `npm run db:deploy` to apply reviewed, committed migrations in deployment;
it does not create migrations or reset the database. Prisma tracks applied files
in `_prisma_migrations`. The event table and time-ordering constraint have separate migrations.
Do not edit already-applied migration files or use `db push` as migration history.

`npm run db:studio` opens a visual database viewer, normally at **http://localhost:5555**.
Keep it local; it can edit real data. The event table can be browsed there.

## Authentication

The API supports `POST /auth/register`, `POST /auth/login` (JSON email/password), `GET /auth/me`, and `POST /auth/logout` (the latter two require `Authorization: Bearer <token>`). Registration returns 201, duplicate emails 409, invalid input 400, and invalid login 401. Email is normalized to lowercase; passwords require 12–1024 characters and are scrypt-hashed with a random salt. PostgreSQL stores a SHA-256 hash of each random session token, not the token itself. Sessions expire after seven days and logout revokes the current session. The Next.js server handles the API token and sets an HttpOnly, SameSite=Lax cookie (Secure in production); client-side JavaScript never receives the token. Deploy behind HTTPS; this project does not yet provide email verification, password reset or MFA.

Redis now holds expiring, atomic counters for both auth endpoints (set the server-only `REDIS_URL`; local Compose provides Redis). In each fixed window login allows 10 attempts per normalized email and 300 per API-visible IP per 15 minutes; registration allows 3 per email and 60 per API-visible IP per hour. Limits include unsuccessful and successful attempts. Exceeding a limit returns 429 with `Retry-After`; a Redis failure returns 503 rather than permitting unlimited attempts. Redis is not used for sessions or account data. These thresholds are starting points, not a substitute for traffic monitoring or ingress limits. **Important:** browser form submissions go through the Next.js server, so the API-visible IP for those requests is the _web server_, not the visitor. These IP budgets are shared by visitors behind that server. Enforce real per-client-IP limits at the trusted public ingress in front of Next.js; do not enable `trustProxy` or trust arbitrary forwarded-IP headers without a locked-down trusted proxy. Secure the API at the ingress too, so requests cannot bypass its intended controls.

## Bookings

The web app presents the existing event journey as discovery → event details → free booking → account. Event cards use CSS-generated artwork (no borrowed photos), UTC date labels, and live remaining-capacity numbers; the event booking panel distinguishes a quantity booking from an assigned seat or paid ticket. Confirmed, pending/retry, sold-out, and closed-event states are labelled distinctly, and the account separates upcoming plans from past or cancelled event bookings. Fictional cinema screenings currently offer expiring **unpaid seat holds**, not confirmed bookings or paid tickets.

`POST /bookings` accepts `{ "eventId": "<uuid>", "quantity": 1 }` (1–10) with `Authorization: Bearer <token>` and a lowercase UUID `Idempotency-Key` header. Use a **new key for each intended purchase**, but reuse the same key and body when retrying after a timeout. The first success returns 201; a retry returns the same booking with 200, even if the event has since sold out. Reusing a key with a different event or quantity returns 409. Keys are scoped to the authenticated user and retained with bookings; pre-existing bookings remain unchanged. `GET /bookings` returns up to 100 bookings for that session's user, newest first. Missing/expired sessions return 401; unpublished, missing or started events return 404; insufficient capacity returns 409. The event catalogue shows remaining seats. A PostgreSQL transaction conditionally increments booked seats and inserts the booking; if insertion fails the increment rolls back, and concurrent requests cannot oversell. Inventory remains in PostgreSQL, never Redis. These bookings are immediate and do not involve payment or assigned seats. The Formik form saves the pending event, quantity and key in browser `sessionStorage` before submitting; a refresh in the same tab restores them, even if the event is now sold out. A confirmed booking clears the pending attempt, but uncertain failures retain it until the user retries or explicitly starts a new booking. Browser storage is not authoritative and does not persist across devices or cleared storage. The session token remains in the Next.js server's HttpOnly cookie, never `sessionStorage`.

`POST /bookings/:id/cancel` requires the owner's bearer token. Cancellation is allowed strictly before the event start according to PostgreSQL's clock; at or after the start it returns 409. Missing bookings and other users' bookings return 404. The first cancellation and subsequent repeats return 200 (with `ok` or `already-cancelled` status). A transaction marks the booking cancelled and releases its quantity from `bookedSeats` exactly once. Cancelled bookings remain visible in `GET /bookings`, and retrying their original creation key returns the cancelled booking without reclaiming seats. The account page shows status and a cancel button while the booking is eligible.

## Cinema reservations (fictional demo)

Run `npm run db:deploy` and then `npm run db:seed` against a **local, non-production database** to add one explicitly fictional cinema, one 100-seat auditorium, six fictional movies, and four future screenings per day for seven days. Rerunning the seed on the same day does not duplicate or overwrite these records. Open **/cinemas** to browse cinemas → movies → showtimes → seats. Times are shown in the cinema's configured time zone (UTC in this demo). No movie API, real cinema photos, or real cinema pricing is used.

Signed-in users can temporarily hold specific seats before the showtime cutoff. **A hold is not a booking or paid ticket:** checkout is not available yet, no payment is taken, and the fictional prices are not charges. The browser keeps the selection and idempotency key in tab storage so an uncertain request can be retried; it displays the owner's hold and an informational countdown. A hold expires in at most 10 minutes and its seats become available without cleanup. Starting over in the browser does **not** release a hold early; it still expires at the original deadline. The API accepts `POST /cinemas/:id/screenings/:screeningId/holds` with `{ "seatIds": ["<uuid>"] }`, a bearer token, and a lowercase UUID `Idempotency-Key`; owner-only `GET /cinema-holds/:id` retrieves its status and USD price snapshot. The old free-booking creation POST now returns `410`; previous free reservations remain occupied and readable at **/cinemas/my-bookings**. See [the cinema plan](docs/architecture/cinema-booking-plan.md) for payment work and [the state machine](docs/architecture/cinema-checkout-state-machine.md) for the rollout rules.

`npm run test:e2e` starts an **isolated, disposable PostgreSQL container**, migrates and seeds it, starts a temporary API and Next.js dev server on free local ports, and runs Chromium through the real browser flow. It does not modify your local Compose database or use your `.env` credentials. The test server uses `apps/web/.next-e2e` so it does not interfere with the normal development server or production build. This suite covers refresh, lost server-action responses and safe replay, occupied seats, and expiration/reclamation; it does **not** cover payment yet.

## Organizer events

Public registration always creates an attendee. On **local databases only**, `npm run db:seed` also creates `demo.organizer@example.com` with password `DemoPassword2026!` (alongside the two attendee demo accounts). These public test credentials must never be used for real accounts. Reseeding does not reset passwords or promote an existing account with that email. Production organizer provisioning is not implemented; there is no public promotion endpoint.

Sign in as the demo organizer and open **/organizer** to create a draft event, edit it, and publish it. Sign in as an attendee in another browser session to book it; refresh the organizer dashboard to see booked/remaining tickets and active/cancelled booking totals. Cancelling before the event starts releases capacity. Drafts never appear in the public catalogue.

The API supports `GET /organizer/events` (up to 50 owned events), `POST /organizer/events` (new draft), `GET` and `PATCH /organizer/events/:id`, and `POST /organizer/events/:id/publish` or `/unpublish`. An organizer can access only their own events; seeded legacy events remain publicly bookable but unowned and uneditable. Schedules are entered as UTC. Published events with active bookings allow text changes and capacity increases only; venue, dates, reductions and unpublishing are blocked. With no active bookings, capacity may decrease and publishing can be reversed before the start. No edits are allowed once an event starts. These rules serialize on the PostgreSQL event row alongside booking changes, so inventory stays authoritative. Reporting exposes counts, never attendee details. This milestone does not include payments, issued tickets, or admin onboarding.

## Repository map

```text
apps/web/                 Next.js App Router UI (server-side API health fetch)
apps/api/                 Fastify modular monolith (health and events modules, Prisma Client)
apps/api/prisma/          Prisma schema and committed SQL migrations
packages/contracts/       Shared API response types (no secrets)
database/migrations/      Unused placeholder; active migrations are in apps/api/prisma/
database/seeds/           Reserved for future seeds
infrastructure/           Local infrastructure notes
docs/architecture/        Architecture decisions and alternatives
docker-compose.yml        Local PostgreSQL, Redis, Kafka (single-node KRaft)
```

See [`docs/architecture/foundation.md`](docs/architecture/foundation.md) for why the pieces fit together this way, alternatives, and trade-offs.

See [the backlog](TODO.md) for deferred features.
