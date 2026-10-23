# Cinema booking plan

## Purpose and current baseline

Add a cinema-booking experience **alongside**, not instead of, TicketForge's existing organizer-owned events and quantity-based event bookings. The existing `User`, `Event`, and `Booking` models and their booking behavior remain intact. Cinema screenings need their own assigned-seat inventory; an event's `capacity`/`bookedSeats` counter cannot represent it.

**Current status:** the catalogue and seat-hold UI are implemented. Signed-in users can request an expiring, unpaid 10-minute hold with an owner lookup, price snapshot, idempotent retry and expiry-aware seat availability. The old free-booking POST is disabled (410), while historical free reservations remain occupied and readable. **Holds cannot yet be purchased or confirmed; there is no paid checkout or ticket issuance.** Payment, refund/recovery, and browser end-to-end coverage remain outstanding. The proposed state transitions and rollout constraints are in [cinema-checkout-state-machine.md](cinema-checkout-state-machine.md).

For the first release use one clearly fictional/demo cinema, one 100-seat auditorium (for example A1–J10), 5–10 fictional seeded movies, and several future screenings (for example four on a day). Use placeholders or images with explicit permission; do not represent invented prices or availability as tickets for a real cinema. A movie-metadata API such as TMDB can be evaluated later, subject to attribution, image rights, caching rules, availability, and server-side credential handling. It must never determine prices or seat availability.

## Domain rules

- A `Seat` is a physical position in an auditorium. A `ScreeningSeat` is that position's independent inventory **for one screening**: booking A1 at 12:00 does not affect A1 at 15:00 or on another day.
- Showtimes stay independently open until their `bookingClosesAt`, which must be no later than `startsAt`; start with a defined cutoff such as 15 minutes before start. After the cutoff, retain history but refuse new holds/bookings. A later showtime can still be booked.
- Display times in the cinema's named time zone, store instants in UTC, and resolve daylight-saving ambiguities when creating schedules. Do not overlap screenings in the same auditorium.
- PostgreSQL is authoritative for seat claims, expirations, confirmed seats, and prices. Redis or the browser may assist presentation but cannot allocate seats. Store money as integer minor units plus an ISO currency code; never use floating-point amounts.
- Seed data is repeatable and explicitly marked as demo content. No organizer cinema-management UI or production cinema onboarding is implied by a seeded catalogue; decide ownership and authorization before adding mutation endpoints.

## Proposed database tables

Columns below are the intended logical schema; exact Prisma field names, enum names, and migration SQL are decided during each milestone. IDs are UUIDs, timestamps are timezone-aware, and relations use foreign keys. `?` means nullable.

| Table             | Columns                                                                                                                          | Key constraints and purpose                                                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cinema`          | `id`, `name`, `description`, `address`, `timeZone`, `imageUrl?`, `createdAt`                                                     | Demo cinema and display details. `timeZone` is an IANA name, not a fixed UTC offset.                                                                                                                                       |
| `Movie`           | `id`, `title`, `synopsis`, `durationMinutes`, `posterUrl?`, `releaseDate?`, `createdAt`                                          | Small fictional catalogue; no external movie ID needed initially.                                                                                                                                                          |
| `Auditorium`      | `id`, `cinemaId`, `name`, `createdAt`                                                                                            | Unique `(cinemaId, name)`. A cinema can have multiple auditoriums.                                                                                                                                                         |
| `Seat`            | `id`, `auditoriumId`, `rowLabel`, `seatNumber`, `category`, `isActive`                                                           | Unique `(auditoriumId, rowLabel, seatNumber)`; positive seat numbers. Preserve historical seats rather than deleting seats used by screenings.                                                                             |
| `Screening`       | `id`, `movieId`, `auditoriumId`, `startsAt`, `endsAt`, `bookingClosesAt`, `priceMinor`, `currency`, `status`, `createdAt`        | Validate end after start, cutoff no later than start, nonnegative price, valid currency; prevent auditorium schedule overlap. `status` distinguishes draft/published/cancelled rather than assuming every row is bookable. |
| `CinemaOrder`     | `id`, `userId`, `screeningId`, `status`, `totalMinor`, `currency`, `idempotencyKey`, `createdAt`, `confirmedAt?`, `cancelledAt?` | One attendee and screening per order; unique `(userId, idempotencyKey)`. Status distinguishes holding, expired, confirmed, cancelled, and payment-recovery cases. Order total is a snapshot.                               |
| `ScreeningSeat`   | `id`, `screeningId`, `seatId`, `status`, `holdExpiresAt?`, `orderId?`, `priceMinor`                                              | Unique `(screeningId, seatId)`; the mutable current claim for a screening/seat. A claim must refer to a seat in that screening's auditorium. Price is a per-screening snapshot, allowing later seat-category pricing.      |
| `CinemaOrderSeat` | `id`, `orderId`, `seatId`, `priceMinor`                                                                                          | Unique `(orderId, seatId)`; immutable selection/price history. Needed because an expired `ScreeningSeat` hold can later point to a _different_ order. Ensure all selected seats belong to the order's screening.           |
| `CinemaPayment`   | `id`, `orderId`, `provider`, `providerPaymentId?`, `amountMinor`, `currency`, `status`, `createdAt`, `updatedAt`                 | Sandbox payment attempts; unique provider payment ID where present. Amount/currency must match the intended order; payment lifecycle is separate from order lifecycle.                                                     |
| `PaymentEvent`    | `id`, `provider`, `providerEventId`, `paymentId?`, `receivedAt`, `processedAt?`, `outcome`                                       | Unique `(provider, providerEventId)` for verified callback deduplication and recovery. Avoid persisting secrets or sensitive raw payment data.                                                                             |

`CinemaOrder`, `ScreeningSeat`, `CinemaOrderSeat`, `CinemaPayment`, and `PaymentEvent` are **future-milestone tables**, not required just to show a catalogue. The order-seat history table is intentional even though the first sketch only listed eight tables: without it, reclaiming an expired hold would erase the original order's seat selection.

## Milestone 1 — Catalogue, schedules, and prices

1. Add `Cinema`, `Movie`, `Auditorium`, `Seat`, and `Screening` with reviewed Prisma migration(s), constraints, indexes, and repeatable, local-friendly demo seeds. Decide how to reject overlapping auditorium schedules (including concurrent writes), and test the database-level guarantee.
2. Provide read-only API and web pages for cinemas, movies, upcoming published screenings, displayed prices, and a read-only auditorium layout if useful. Validate API inputs and outputs at boundaries; paginate/limit catalogue results. Do not show a functional reserve or pay action yet.
3. Test future/cutoff filtering, four independent showtimes, time-zone display, prices, seed reruns, invalid schedules, and preservation of the existing events/bookings flows.

**Done when:** a visitor can browse a clearly labelled demo cinema, its movies, and independently scheduled screenings with prices; no screen suggests that a seat is bookable before claims exist.

## Milestone 2 — Selection and expiring holds

1. Add `CinemaOrder`, `ScreeningSeat`, and `CinemaOrderSeat`. Create screening inventory from the auditorium's seat template, and freeze or deliberately version layout changes for screenings with inventory/bookings.
2. Show per-screening seat availability and let an authenticated attendee hold a small bounded set of seats for a fixed period. Enforce the booking cutoff using PostgreSQL time. In one transaction, lock the requested `ScreeningSeat` rows in a stable order, verify all are available (including expired holds), then create/update the order and claims; all-or-nothing, no partial seat allocation.
3. Treat an expired hold as reclaimable even when background cleanup has not run; cleanup only improves housekeeping. A retry with the same user/idempotency key and same selection returns the same outcome; a changed selection with that key conflicts. Confirming a seat requires that its current claim still belongs to the order and has not expired. Store selected seats and prices on the order regardless of later reclamation.
4. Test two users racing for the final seat, multi-seat atomicity, duplicate/replayed requests, abandoned/expired holds, races with cleanup and the cutoff, and isolation between showtimes. Do not charge money in this milestone.

**Done when:** only one active claimant can hold or confirm a screening's seat at a time, even across API instances and delayed cleanup.

## Milestone 3 — Sandbox checkout and confirmation

1. Pick a payment provider and document its sandbox credentials, supported callbacks, signature verification, expiry behavior, and refund/test capabilities before implementing its adapter. Secrets stay server-side.
2. Add `CinemaPayment` and `PaymentEvent`. Create provider payment attempts idempotently, validate verified callbacks, and process repeat/out-of-order events safely. Under a PostgreSQL transaction, confirm an order and its seats only if the hold still owns every seat and is unexpired. Keep provider/network calls outside the seat transaction; if external event publishing is added later, use a transactional outbox.
3. If payment succeeds after the hold expires or seats have been reclaimed, **never issue those seats**: mark the order for explicit refund/recovery and surface that state honestly. Specify cancellation/refund rules separately before enabling them.
4. Test duplicate callbacks, lost browser responses, failed payments, simultaneous expiry and success, paid-but-unavailable recovery, and amount/currency mismatch. Never describe unpaid holds as purchased tickets.

**Done when:** a sandbox payment can confirm an owned, unexpired selection exactly once; late or ambiguous outcomes do not oversell and have a documented recovery path.

## Verification for every milestone

Write a failing test before new behavior. Include failure paths and real-PostgreSQL concurrency integration tests for inventory transitions. Preserve the existing event booking behavior. Before claiming a milestone complete, run Prisma validation/migration checks, strict typecheck, lint, formatting, unit and relevant integration tests, and API/web builds. Update product documentation to say precisely which milestone is actually implemented.

## Decisions to revisit at implementation time

- Fictional seed data is the default; only use an external movie API after licensing and attribution review.
- Single price per screening initially; `Seat.category` plus per-screening seat-price snapshots allow later premium pricing. Decide the policy for changes to a screening that already has holds or orders.
- Seeded demo cinema first; organizer ownership, auditorium/screening management, staff permissions, and production onboarding are separate product work.
- Choose the sandbox payment provider and exact hold duration only when implementing their milestones. Neither is a blocker for catalogue work.
