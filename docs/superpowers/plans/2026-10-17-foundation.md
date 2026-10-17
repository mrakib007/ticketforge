# TicketForge Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a runnable, testable, educational full-stack monorepo foundation without booking functionality.

**Architecture:** pnpm workspace with a server-rendered Next.js health display and a Fastify API with isolated database configuration. Local Docker Compose runs infrastructure; API remains the only database consumer.

**Tech Stack:** Node 24, pnpm 10, Next.js 15, React 19, Fastify 5, pg 8, PostgreSQL 16, Redis 7, Kafka KRaft, TypeScript, Tailwind, Vitest, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-10-17-foundation-design.md`

## Global Constraints

- No booking, auth, payments, event management, ORM, Redis or Kafka clients yet.
- Keep all credentials server-side and every direct dependency pinned exactly.
- Local services must work without paid providers.

## Review Focus

- Database unavailable: readiness returns 503 without leaking credentials; injection test.
- Database query failing: readiness returns 503; injection test.
- Supabase URL selected with TLS: pool config enables verification; config test.
- Web API unreachable: page renders a safe unavailable state; web test or build verification.
- Shutdown during an open connection: pool closes and server stops; unit/integration test.

---

### Task 1: Workspace and infrastructure

**Files:** root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `docker-compose.yml`, `packages/contracts/*`, `database/{migrations,seeds}/.gitkeep`, `infrastructure/README.md`.

**Interfaces:** provides workspace names `@ticketforge/api`, `@ticketforge/web`, `@ticketforge/contracts`; API port 3001, web port 3000.

- [ ] Create pinned workspace manifests and empty directories; validate with `corepack pnpm install`.
- [ ] Add Docker healthchecked PostgreSQL and Redis plus single-node KRaft Kafka; validate Compose syntax if Docker available.
- [ ] Add shared health type/constants and run `corepack pnpm typecheck` once consumers exist.

### Task 2: API configuration and health

**Files:** `apps/api/package.json`, `tsconfig.json`, `src/config.ts`, `src/db/pool.ts`, `src/app.ts`, `src/server.ts`, `src/modules/health/routes.ts`, `test/*.test.ts`.

**Interfaces:** `buildApp({ checkDatabase }): FastifyInstance`; `createPool(config): Pool`; `loadConfig(env): Config`.

- [ ] Write failing health injection tests: live 200, ready 200, ready 503 on unavailable/throwing database.
- [ ] Run `corepack pnpm --filter @ticketforge/api test` and confirm expected failure.
- [ ] Implement env validation, pg pool with SSL for Supabase, readiness timeout and health routes; rerun test.
- [ ] Write config and optional Testcontainers PostgreSQL tests, run tests and typecheck; wire signal shutdown and pool end.

### Task 3: Frontend health page

**Files:** `apps/web/package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `src/app/{layout.tsx,page.tsx,globals.css}`, `src/lib/api-health.ts`.

**Interfaces:** server-only `fetchApiHealth(): Promise<HealthResult>` fetching backend `/health/ready`.

- [ ] Implement responsive page with clear healthy/unavailable backend state and safe fetch failure behavior.
- [ ] Run Next build/typecheck and check that credentials are not imported or exposed to browser.

### Task 4: Developer experience and documentation

**Files:** root ESLint/Prettier config, `AGENTS.md`, `README.md`, `docs/architecture/foundation.md`.

- [ ] Document exact prerequisites, env configuration, install/start/test/lint/typecheck/build/Docker commands, and decisions with alternatives/trade-offs.
- [ ] Run install, tests, lint, format check, typecheck and builds; record unavailable Docker-dependent verification accurately.
