# TicketForge backlog

## Next: booking cancellation

- Add an authenticated cancellation endpoint for a user's own booking and a cancel action in the account UI.
- Decide the cutoff for cancellation (for example, before the event starts); reject cancellations after it.
- Mark a booking cancelled and restore its quantity to event capacity in **one PostgreSQL transaction**. Make repeated cancellation safe and prevent inventory underflow.
- Test authorization, cutoff, repeat requests, concurrent cancellation/booking, and the account UI's success and failure states.

## Later: durable booking intents

The current Formik flow keeps a pending event, quantity, and idempotency key in browser `sessionStorage`. It supports retries after a refresh in the **same tab**, but cannot reliably recover after closing that tab, switching devices, or losing browser storage. Completed bookings and their idempotency keys are already stored in PostgreSQL.

- Store pending booking intents in PostgreSQL, scoped to a user, with event, quantity, stable key, status, and optional resulting booking. A pending intent must **not** hold seats unless timed reservations are designed separately.
- Provide authenticated create/read/confirm operations so the UI can resume or inspect an attempt across tabs and devices. Distinguish an intentional new purchase from a retry of an older one.
- Confirm the booking, claim capacity, and transition the intent atomically. Keep confirmed outcomes discoverable, and define expiry/cleanup only for stale _pending_ intents.
- Test lost responses, cross-device recovery, account isolation, concurrent confirmation, sold-out events, and replay after an event sells out. PostgreSQL remains authoritative; Redis may cache reads but must not own booking state.

## Separate features

- Payments and payment-aware booking states; do not treat an unpaid booking as a paid ticket.
- Password reset and email verification.
