# TicketForge backlog

## Next product milestones

- Ticket issuance and check-in: single-use ticket codes, authorized scanning/check-in, duplicate-scan safety, and lost-ticket recovery. Do not present free bookings as paid tickets.
- Payment-aware booking states: explicit pending/confirmed/failed/refunded transitions, payment webhook verification and idempotency, and expiry or reversal of unpaid inventory.
- Durable booking intents: store pending attempts in PostgreSQL for recovery across tabs/devices without holding seats; test lost responses and concurrent confirmation.

## Production and presentation

- Design trusted organizer onboarding; local-only demo seeding is not production provisioning. Consider event pagination, organizer filters, and audit history.
- Add browser end-to-end tests, then deployment instructions, demo hardening, screenshots and observability before publishing a live demo.
- Password reset and email verification; trusted ingress rate limits and secure TLS deployment.
- If Kafka becomes useful, publish booking changes through a transactional outbox, never directly alongside a database transaction.
