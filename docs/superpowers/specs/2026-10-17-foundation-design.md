# TicketForge Step 1 design

Build a single Git repository with a pnpm workspace containing an App Router web application, a modular Fastify API, and a reserved contracts package. The purpose is to teach production-oriented backend foundations without prematurely implementing bookings or distributed workflows.

The API owns PostgreSQL credentials and exposes independent liveness and database-aware readiness endpoints. The Next.js server fetches the API's health response and displays a friendly available/unavailable state; no credentials or privileged backend URL need to reach browser JavaScript. PostgreSQL is the future authoritative system of record. Redis and single-node KRaft Kafka are local infrastructure only in Step 1.

Use strict TypeScript, exact dependency pins, ESLint, Prettier, pg Pool, explicit startup and shutdown, Vitest injection-based HTTP tests and an optional Testcontainers PostgreSQL connectivity test. Local development uses Docker Compose for services, while an env-selectable connection string supports Supabase TLS. Document installation and architectural alternatives/trade-offs. No ORM, authentication, payments, reservations, events, or Kafka/Redis client integration.

Assumptions chosen for speed: Node 24 LTS, pnpm 10, localhost ports 3000/3001/5432/6379/9092; the API's health JSON is a minimal shared shape documented in contracts; non-secret local defaults are provided in the environment example. Docker is not available in the current shell, so Docker-dependent verification may require the user's machine.
