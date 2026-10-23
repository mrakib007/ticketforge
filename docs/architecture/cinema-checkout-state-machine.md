# Cinema checkout state machine (design; not implemented)

This is the design for a **fictional, USD, Stripe-test-mode-only** cinema checkout. The browser now creates temporary holds and the old free-reservation POST is disabled; existing free bookings remain readable and occupied. No Stripe payment or paid booking exists yet. Never advertise a paid checkout until payment and recovery are working.

## Ownership and time

- PostgreSQL owns screening inventory, the order, its price snapshot, and all state transitions. Redis, browser storage, Stripe redirects, and cleanup jobs cannot allocate or confirm seats.
- A hold lasts **10 minutes from the PostgreSQL creation time** (`expiresAt`). It cannot extend beyond `bookingClosesAt`. At the exact expiry instant it is no longer valid (`expiresAt > database_now` is required for confirmation). Show a countdown using the server-provided timestamp; the UI timer is informational, not enforcement.
- Count **confirmed seats plus unexpired seats held by the same user** toward the 10-seat-per-screening cap, including multiple orders and concurrent requests. Expired holds do not count. A user cannot hold a seat they already own in a confirmed order.
- For the first payment version, accept only immediate USD card payments in Stripe test mode. Price in integer cents is copied from the screening into the order and order-seat history on hold creation. Never recalculate an existing order from a subsequently edited screening or trust a browser-provided total.

## Order states

| State              | Meaning                                                                        | Seat inventory                                        |
| ------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `HOLDING`          | Unpaid, with an ownership claim valid strictly until `holdExpiresAt`           | Unavailable to others until expiry                    |
| `EXPIRED`          | Unpaid and past expiry, or checkout abandoned                                  | Available; historical order-seat selection retained   |
| `CONFIRMED`        | Verified paid result and still-owned, unexpired seats                          | Permanently unavailable                               |
| `PAYMENT_FAILED`   | Verified failure without a successful charge                                   | Held until expiry if still valid; otherwise available |
| `PAID_UNFULFILLED` | Verified payment, but at least one seat is no longer owned or the hold expired | No tickets issued; refund/reconciliation required     |

`EXPIRED` and `PAYMENT_FAILED` are not proof of non-payment if a provider outcome is still outstanding. Record payment attempts and verified events separately from orders; do not silently overwrite a paid outcome with an expiry update. A confirmed order cannot expire. Additional cancellation/refund behavior is out of scope until its rules are specified.

## Allowed transitions

1. **Select → HOLDING:** An authenticated attendee sends 1–10 distinct seats and an idempotency key. In one transaction, lock the user's row and requested per-screening inventory rows in stable order; check publication, cutoff, seat eligibility, other active claims, the cumulative cap, and the database clock. Atomically write an order, immutable seat/price snapshot, and all seat claims. If any check fails, claim none. A replay with the same key and selection returns the original order and expiry, even if the hold has since expired; a different selection with that key conflicts. It must not create a fresh hold.
2. **HOLDING → EXPIRED:** At expiry, claims become reclaimable during _any_ availability read or competing hold, whether or not a cleanup worker has run. Cleanup can later update order status and attempt to expire its open Stripe Checkout Session, but cannot be required for correctness. Abandoning the browser does not keep seats reserved.
3. **HOLDING → CONFIRMED:** Only a verified Stripe result with matching order, session/payment attempt, USD amount, and paid status may initiate this transition. In a transaction, require every selected seat to still belong to this order and require `holdExpiresAt > database_now` before marking order and claims confirmed together. Duplicate callbacks must not confirm twice.
4. **HOLDING → PAYMENT_FAILED:** A verified failed payment records the failed attempt. The attendee may retry within the _original_ hold if supported; retrying never extends its expiry. An expired hold must be replaced by a new order and new seat allocation.
5. **Expired/reclaimed hold + successful payment → PAID_UNFULFILLED:** Record the verified charge, issue **no tickets**, and mark it for explicit test-mode refund/reconciliation. Do not reclaim another attendee's seats. A browser success URL only reads the server-side status; it cannot perform confirmation.

The current backend uses a locked physical `Seat` row to serialize claims for each screening and seat; PostgreSQL triggers enforce cross-path exclusivity with previously confirmed free bookings. This also serializes claims on different screenings of the same physical seat (a tradeoff to revisit if contention becomes material). Hold-seat rows remain as selection/price history after expiry and can coexist with newer claims. Make state changes idempotent and resilient to duplicate or out-of-order provider events. Do not call Stripe inside the PostgreSQL seat transaction.

## Checkout expiry mismatch

Stripe-hosted Checkout Sessions have a configurable expiration of **30 minutes to 24 hours**, not 10 minutes ([Stripe's Checkout Session API](https://docs.stripe.com/api/checkout/sessions/create)). The database hold still ends at 10 minutes. Attempt to expire an open Stripe Session when the hold ends, but this is best effort: an in-flight successful payment can arrive afterward and must follow `PAID_UNFULFILLED`, never `CONFIRMED`. Do not enable Stripe's expired-session recovery link, which could pay for a released selection.

## Existing free reservations and rollout

The existing `CinemaBooking` / `CinemaBookingSeat` records are **already confirmed free reservations**. Preserve those records and their occupied seats during the hold and payment cutover. The existing unique `(screeningId, seatId)` constraint and database triggers continue protecting permanent bookings and active holds across both tables. Availability reads count both; the public immediate-free-booking POST now returns 410. The legacy repository method remains for migration/integration testing, not public creation. Never drop the database guards without replacing their guarantees.

## Required tests before enabling the flow

Start with failing tests for simultaneous claims on the last seat, multi-seat atomicity, the cumulative 10-seat limit across old confirmed reservations and new holds, idempotent replay and changed-selection conflict, exact expiry boundary, a hold reclaimed without cleanup, cross-showtime independence, and preservation of old confirmed bookings. Payment-stage tests must cover verified versus forged callbacks, duplicate and out-of-order delivery, wrong amount/currency, missing redirect, failed payment, expiry racing with payment, and paid-but-unfulfilled recovery. Run real-PostgreSQL concurrency tests as well as API and UI tests.
