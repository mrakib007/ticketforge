# TicketForge backlog

## Completion plan: paid cinema checkout, not a free-booking handoff

The current free-reservation browser demo and backend-only holds are **not** the finish line. Follow [the checkout state machine](docs/architecture/cinema-checkout-state-machine.md); keep existing event bookings and previously confirmed free cinema seats intact. Target is a clearly labelled **Stripe test-mode** cinema checkout first. A production-money launch requires separate security, operational and legal review. Work in small tested slices; do not expose a new purchase button before the corresponding backend, recovery path and tests are ready.

1. [x] **Complete the hold cutover.** Add authenticated seat selection → hold → owner-visible order status and expiry countdown; preserve the idempotency key across refresh/uncertain responses. Clearly distinguish held, expired, confirmed and unavailable seats. Remove the immediate-free-booking creation path from the public UI and API **together**, retaining reads/history for old free reservations. Validate release of expired seats without a worker and cumulative limits across legacy reservations and active holds. Test races, cutoff, cross-showtime independence and browser failure/retry flows against real PostgreSQL.
2. [ ] **Integrate Stripe test-mode checkout.** Document test account setup, server-only credentials, webhook signing secret, Checkout Session configuration and the 10-minute hold versus Stripe's minimum 30-minute session expiry. Persist payment attempts and verified webhook events with uniqueness/idempotency. Create sessions outside the inventory transaction using the server-side USD price snapshot; never trust browser amounts or success redirects. Authenticate owner access, verify signatures and amounts/currency, and handle duplicate/out-of-order callbacks.
3. [ ] **Implement settlement and seat release.** Atomically confirm only an owned, still-active hold with every seat still available; confirmed seats stay occupied. Expired/failed/abandoned holds release seats even without cleanup. A late successful charge or reclaimed seat goes to `PAID_UNFULFILLED` and a visible, actionable refund/reconciliation queue; never issue those seats. Define and test refund, cancellation, retry and lost-response policies, plus operational reconciliation of missing/delayed webhooks. Use best-effort Stripe session expiration without relying on it for inventory correctness.
4. [ ] **Finish the attendee experience.** Show checkout, pending/confirmed/expired/failed/refund-needed status, price and currency, receipts/booking history, and a clear no-ticket-until-confirmed message. Add single-use ticket issuance and authorized check-in only after paid confirmation; handle duplicate scans and ticket recovery. Keep free event bookings explicitly separate from paid cinema tickets.
5. [ ] **Release gates.** Add browser end-to-end coverage, real-PostgreSQL concurrent purchase/expiry/confirmation tests, sandbox webhook replay/forgery and amount-mismatch tests, and manual test-card walkthroughs. Recheck migrations, schema, types, lint, formatting, unit/integration tests and builds after the last code change. Document environment/deployment, HTTPS, ingress limits, secrets, backup/restore, monitoring/alerts and the refund/reconciliation runbook; do not seed public demo credentials in a live deployment. Only call it production-ready after a security/operations review.

Dependency audit (2026-10-24): `npm audit --omit=dev --audit-level=high` reports high-severity advisories in pinned Fastify and Next.js/PostCSS. Reassess and upgrade them with regression tests before any public deployment; do not automatically force a Next.js major upgrade during checkout work.

Current verification baseline (2026-10-24): Prisma validation, typecheck, lint, format, unit tests, PostgreSQL and Redis integration tests, builds and browser hold-flow tests pass **for the unpaid hold cutover only**. None of the paid-checkout gates above are complete.

## Next product milestones

- Durable booking intents: store pending attempts in PostgreSQL for recovery across tabs/devices without holding seats; test lost responses and concurrent confirmation.

## Production and presentation

- Design trusted organizer onboarding; local-only demo seeding is not production provisioning. Consider event pagination, organizer filters, and audit history.
- Password reset and email verification; trusted ingress rate limits and secure TLS deployment.
- If Kafka becomes useful, publish booking changes through a transactional outbox, never directly alongside a database transaction.
