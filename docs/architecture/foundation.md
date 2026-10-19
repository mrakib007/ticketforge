# Step 1 architecture and trade-offs

## Request path and boundaries

```text
Browser → Next.js server (apps/web) → GET /health/ready → Fastify (apps/api)
                                                     → Prisma Client → pg adapter → PostgreSQL

              Redis (local only)      Kafka KRaft (local only)
```

**Decision:** An npm workspaces monorepo contains independent `web` and `api` applications. `packages/contracts` shares just the health response type; the frontend does not import API code or connect to PostgreSQL. **Why:** one Git repo and one install simplify learning and changes across the boundary, while separate processes make ownership explicit. **Alternatives:** separate repositories or a single Next.js app with API routes. **Trade-off:** a workspace adds tooling; type sharing does not replace runtime response validation (the web fetch checks the response).

**Decision:** Render the health state through a Next.js Server Component with an uncached, timed server-side fetch. **Why:** no browser CORS configuration and no accidental client exposure of private infrastructure settings. The page remains usable if the API is down. **Alternatives:** browser fetch with CORS or proxying through a custom Next.js route. **Trade-off:** each page request performs a readiness query; this is acceptable for a foundation but a real dashboard may poll and throttle probes. The server URL is configurable through `API_INTERNAL_URL`; a browser never sees database credentials.

## Backend and data

**Decision:** Keep a modular monolith. The health module owns its routes, the database module owns Prisma Client and its adapter configuration, and `server.ts` composes and shuts down dependencies. `app.ts` accepts a check function so tests exercise actual HTTP handling via Fastify injection without network calls. **Why:** one deployable backend avoids distributed-service complexity while preserving module boundaries. **Alternatives:** microservices or all routes in one file. **Trade-off:** modules run in the same process; boundaries rely on developer discipline, enforced by `AGENTS.md` and tests.

**Decision:** PostgreSQL is authoritative; Prisma Client 7.10.1 accesses it through `@prisma/adapter-pg`. The adapter owns connection reuse (10 max, 2-second connect and query timeouts, 30-second idle timeout). **Why:** the project now requires Prisma ORM for typed model queries and Prisma Migrate for reviewed, version-controlled schema changes. This replaces the original direct-`pg` and custom migration approach. **Alternatives:** direct SQL with `pg`, one connection per request, or a separate pooling proxy. **Trade-off:** Prisma adds generated code and tooling; SQL and transactions still matter. Each API instance holds its own pool, so deployments must budget connections. Future write transactions need purpose-specific timeout policies. Prisma migrations are explicit, never run during API startup.

**Decision:** `DATABASE_URL` selects local Postgres or Supabase; `DB_SSL=true` enables certificate-verified TLS. **Why:** the same SQL connection contract works in either environment. **Alternatives:** separate DB clients per provider or storing TLS mode only in URL parameters. **Trade-off:** explicit per-environment env management; `pg` URL SSL parameters can override SSL config, so prefer a plain URL without `sslmode` parameters. Supabase credentials exist only in `apps/api/.env`.

**Decision:** `/health/live` reports only that Fastify responds, while `/health/ready` executes the tagged, parameterized Prisma `$queryRaw` query `SELECT 1` and returns 503 when DB is unreachable. **Why:** orchestrators should not restart a healthy process just because a dependency is temporarily down; readiness stops traffic until dependencies recover. **Alternatives:** a single `/health` endpoint or a startup-time DB requirement. **Trade-off:** readiness incurs a database query and exposes broad availability (never error details). The API logs failure internally. SIGINT/SIGTERM close the HTTP server and disconnect Prisma, which disposes its adapter-owned pool.

## Infrastructure, testing and future evolution

**Decision:** Docker Compose provides PostgreSQL, Redis and a single-node Kafka broker in KRaft mode without ZooKeeper. **Why:** fully local and reproducible, ready for later learning. **Alternatives:** paid managed services or more realistic multi-node clusters. **Trade-off:** single-node Kafka and default local passwords are not production secure or fault tolerant. Redis/Kafka have no clients or application data flows in Step 1.

**Decision:** Vitest tests Fastify injection and error handling without Docker. Separate integration tests exercise Prisma readiness, unavailable database handling, and repeated Prisma Migrate deployment against temporary PostgreSQL. **Why:** fast default feedback plus a higher-confidence database check when Docker exists. **Alternatives:** mocking Prisma for every test or requiring Docker for all tests. **Trade-off:** default tests do not prove Docker, Compose health, or TLS access to a Supabase account; run the optional integration tests and smoke-check Compose locally. CI also validates the Prisma schema. No domain tables or migrations are added until their features are requested.

Later, booking transactions must write to PostgreSQL first; Redis may cache or limit rates but never allocate seats authoritatively. Kafka should publish from a transactional outbox committed with the booking, not from a direct network send in the booking transaction. Neither is implemented here.
