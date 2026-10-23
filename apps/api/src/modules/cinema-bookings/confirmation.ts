import type { PrismaClient } from '../../generated/prisma/client.js';

type Result =
  | { status: 'confirmed'; replayed: boolean }
  | { status: 'not-found' | 'expired' | 'taken' | 'invalid' };

/**
 * Inventory-only transition. Never expose this through an attendee route or
 * invoke it from a redirect: a future payment adapter must verify the provider
 * event, amount, currency and payment attempt before calling this function.
 * Payment proof and refund/reconciliation are NOT implemented here.
 */
export function createCinemaHoldSettlementRepository(database: PrismaClient) {
  return {
    async confirmOwnedSeats(holdId: string): Promise<Result> {
      return database.$transaction(async (tx) => {
        const initial = await tx.cinemaHold.findUnique({
          where: { id: holdId },
          select: { userId: true, seats: { select: { seatId: true } } },
        });
        if (!initial) return { status: 'not-found' };
        // Same user -> physical seats (UUID order) -> hold lock order as the
        // reservation paths. Check the PostgreSQL clock AFTER acquiring locks.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${initial.userId}::uuid FOR UPDATE`;
        const seatIds = initial.seats.map((seat) => seat.seatId).sort();
        if (seatIds.length < 1 || seatIds.length > 10)
          return { status: 'invalid' };
        for (const seatId of seatIds) {
          await tx.$queryRaw`SELECT "id" FROM "Seat" WHERE "id" = ${seatId}::uuid FOR UPDATE`;
        }
        await tx.$queryRaw`SELECT "id" FROM "CinemaHold" WHERE "id" = ${holdId}::uuid FOR UPDATE`;
        const row = await tx.cinemaHold.findUniqueOrThrow({
          where: { id: holdId },
          select: {
            userId: true,
            screeningId: true,
            status: true,
            expiresAt: true,
            totalMinor: true,
            seats: { select: { seatId: true, priceMinor: true } },
          },
        });
        if (row.status === 'CONFIRMED')
          return { status: 'confirmed', replayed: true };
        if (row.status !== 'HOLDING' && row.status !== 'PAYMENT_FAILED')
          return { status: 'invalid' };
        if (
          row.userId !== initial.userId ||
          row.seats.length !== seatIds.length ||
          row.seats.some((seat) => !seatIds.includes(seat.seatId)) ||
          row.seats.reduce((total, seat) => total + seat.priceMinor, 0) !==
            row.totalMinor
        )
          return { status: 'invalid' };
        const [clock] = await tx.$queryRaw<
          { now: Date }[]
        >`SELECT clock_timestamp() AS now`;
        const now = clock!.now;
        if (row.expiresAt <= now) return { status: 'expired' };
        const legacy = await tx.cinemaBookingSeat.count({
          where: { screeningId: row.screeningId, seatId: { in: seatIds } },
        });
        const competing = await tx.cinemaHoldSeat.count({
          where: {
            screeningId: row.screeningId,
            seatId: { in: seatIds },
            holdId: { not: holdId },
            hold: {
              OR: [
                { status: 'CONFIRMED' },
                {
                  status: { in: ['HOLDING', 'PAYMENT_FAILED'] },
                  expiresAt: { gt: now },
                },
              ],
            },
          },
        });
        if (legacy || competing) return { status: 'taken' };
        // The DB trigger repeats expiry/ownership checks at the write itself,
        // including if the hold expires between the read and this update.
        await tx.cinemaHold.update({
          where: { id: holdId },
          data: { status: 'CONFIRMED' },
        });
        return { status: 'confirmed', replayed: false };
      });
    },
  };
}
