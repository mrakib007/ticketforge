# TicketForge engineering rules

- This repository is an npm workspaces monorepo: `apps/web` is the Next.js user interface, `apps/api` is a Fastify modular monolith, and `packages/contracts` contains shared transport types only.
- Use Node 24 LTS and strict TypeScript. Keep runtime validation at process boundaries; never trust external inputs just because they have TypeScript types.
- Backend modules own their routes and domain logic. Keep transport, database access, and infrastructure wiring separate. Do not query PostgreSQL from the frontend.
- PostgreSQL is the authority for future bookings and seat inventory. Redis is not authoritative. Future Kafka publishing must use a transactional outbox, not a direct write beside a database transaction.
- Keep secrets on the server. Never put database credentials or privileged URLs in `NEXT_PUBLIC_` variables or client-side code. Do not commit `.env` files.
- Use Prisma Client for database access. Parameterize any raw SQL; never interpolate untrusted values. Use transactions for multi-statement state changes.
- Dependencies should be minimal and pinned. Use Prisma ORM and Prisma Migrate. No Go service or unnecessary microservices.
- New behavior requires a failing test first. Test success and failure paths, keep health probes cheap and safe, and verify typecheck, lint, tests, and build before claiming completion.
- Handle expected failures deliberately, log server-side errors without leaking credentials into responses, and clean up connections on shutdown.
- Step 1 is foundation only: do not add authentication, payments, events, reservations or bookings without a new instruction.
