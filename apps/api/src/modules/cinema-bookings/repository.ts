import type {
  PublicCinemaBooking,
  PublicCinemaBookingReceipt,
  PublicCinemaHold,
} from '@ticketforge/contracts';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';

export interface CinemaBookingRepository {
  list(userId: string): Promise<PublicCinemaBookingReceipt[]>;
  hold(
    userId: string,
    cinemaId: string,
    screeningId: string,
    seatIds: string[],
    key: string,
  ): Promise<
    | { status: 'ok'; hold: PublicCinemaHold; replayed: boolean }
    | { status: 'conflict' | 'not-found' | 'taken' | 'limit' }
  >;
  getHold(userId: string, id: string): Promise<PublicCinemaHold | null>;
  create(
    userId: string,
    cinemaId: string,
    screeningId: string,
    seatIds: string[],
    key: string,
  ): Promise<
    | { status: 'ok'; booking: PublicCinemaBooking; replayed: boolean }
    | { status: 'conflict' | 'not-found' | 'taken' | 'limit' }
  >;
}

const fields = {
  id: true,
  screeningId: true,
  createdAt: true,
  seats: { select: { seatId: true } },
} as const;
type BookingRow = {
  id: string;
  screeningId: string;
  createdAt: Date;
  seats: { seatId: string }[];
};

function present(row: BookingRow): PublicCinemaBooking {
  return {
    id: row.id,
    screeningId: row.screeningId,
    seatIds: row.seats.map((seat) => seat.seatId).sort(),
    createdAt: row.createdAt.toISOString(),
  };
}

type HoldRow = {
  id: string;
  screeningId: string;
  status: PublicCinemaHold['status'];
  expiresAt: Date;
  totalMinor: number;
  currency: string;
  seats: { seatId: string }[];
};
const holdFields = {
  id: true,
  screeningId: true,
  status: true,
  expiresAt: true,
  totalMinor: true,
  currency: true,
  seats: { select: { seatId: true } },
} as const;
function presentHold(row: HoldRow): PublicCinemaHold {
  return {
    id: row.id,
    screeningId: row.screeningId,
    seatIds: row.seats.map((seat) => seat.seatId).sort(),
    status:
      row.status === 'HOLDING' && row.expiresAt <= new Date()
        ? 'EXPIRED'
        : row.status,
    expiresAt: row.expiresAt.toISOString(),
    totalMinor: row.totalMinor,
    currency: row.currency,
  };
}

export function createCinemaBookingRepository(
  database: PrismaClient,
): CinemaBookingRepository {
  return {
    async getHold(userId, id) {
      const row = await database.cinemaHold.findFirst({
        where: { id, userId },
        select: holdFields,
      });
      return row ? presentHold(row) : null;
    },
    async hold(userId, cinemaId, screeningId, seatIds, key) {
      const sorted = [...seatIds].sort();
      const where = { userId_idempotencyKey: { userId, idempotencyKey: key } };
      function previous(row: HoldRow) {
        const hold = presentHold(row);
        return hold.screeningId === screeningId &&
          hold.seatIds.length === sorted.length &&
          hold.seatIds.every((seat, index) => seat === sorted[index])
          ? ({ status: 'ok', hold, replayed: true } as const)
          : ({ status: 'conflict' } as const);
      }
      try {
        return await database.$transaction(async (tx) => {
          const existing = await tx.cinemaHold.findUnique({
            where,
            select: holdFields,
          });
          if (existing) return previous(existing);
          // Same lock order as the legacy booking path and both DB triggers.
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
          const [clock] = await tx.$queryRaw<
            { now: Date }[]
          >`SELECT clock_timestamp() AS now`;
          const now = clock!.now;
          const screening = await tx.screening.findFirst({
            where: {
              id: screeningId,
              auditorium: { cinemaId },
              status: 'PUBLISHED',
              startsAt: { gt: now },
              bookingClosesAt: { gt: now },
            },
            select: {
              auditoriumId: true,
              bookingClosesAt: true,
              priceMinor: true,
              currency: true,
            },
          });
          if (!screening) return { status: 'not-found' } as const;
          const expiresAt = new Date(
            Math.min(
              now.getTime() + 600_000,
              screening.bookingClosesAt.getTime(),
            ),
          );
          if (expiresAt <= now) return { status: 'not-found' } as const;
          for (const seatId of sorted) {
            await tx.$queryRaw`SELECT "id" FROM "Seat" WHERE "id" = ${seatId}::uuid FOR UPDATE`;
          }
          const valid = await tx.seat.count({
            where: {
              id: { in: sorted },
              auditoriumId: screening.auditoriumId,
              isActive: true,
            },
          });
          if (valid !== sorted.length) return { status: 'taken' } as const;
          const occupied = await tx.cinemaBookingSeat.count({
            where: { screeningId, seatId: { in: sorted } },
          });
          const held = await tx.cinemaHoldSeat.count({
            where: {
              screeningId,
              seatId: { in: sorted },
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
          if (occupied + held) return { status: 'taken' } as const;
          const confirmedCount = await tx.cinemaBookingSeat.count({
            where: { userId, screeningId },
          });
          const holdCount = await tx.cinemaHoldSeat.count({
            where: {
              userId,
              screeningId,
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
          if (confirmedCount + holdCount + sorted.length > 10)
            return { status: 'limit' } as const;
          const created = await tx.cinemaHold.create({
            data: {
              userId,
              screeningId,
              idempotencyKey: key,
              expiresAt,
              totalMinor: screening.priceMinor * sorted.length,
              currency: screening.currency,
            },
            select: { id: true },
          });
          await tx.cinemaHoldSeat.createMany({
            data: sorted.map((seatId) => ({
              holdId: created.id,
              userId,
              screeningId,
              seatId,
              priceMinor: screening.priceMinor,
            })),
          });
          const row = await tx.cinemaHold.findUniqueOrThrow({
            where: { id: created.id },
            select: holdFields,
          });
          return {
            status: 'ok',
            hold: presentHold(row),
            replayed: false,
          } as const;
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const existing = await database.cinemaHold.findUnique({
            where,
            select: holdFields,
          });
          if (existing) return previous(existing);
          return { status: 'taken' } as const;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2004' || error.code === 'P2010')
        ) {
          if (
            String(error.meta?.database_error ?? '').includes(
              'CinemaHoldSeat_limit_check',
            )
          )
            return { status: 'limit' } as const;
          if (
            String(error.meta?.database_error ?? '').includes(
              'CinemaHoldSeat_eligible_check',
            )
          )
            return { status: 'taken' } as const;
        }
        throw error;
      }
    },
    async list(userId) {
      const rows = await database.cinemaBooking.findMany({
        where: { userId },
        include: {
          screening: {
            select: {
              startsAt: true,
              movie: { select: { title: true } },
              auditorium: {
                select: { cinema: { select: { id: true, name: true } } },
              },
            },
          },
          seats: {
            include: { seat: { select: { rowLabel: true, seatNumber: true } } },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
      });
      return rows.map((row) => ({
        ...present(row),
        cinemaId: row.screening.auditorium.cinema.id,
        cinemaName: row.screening.auditorium.cinema.name,
        movieTitle: row.screening.movie.title,
        startsAt: row.screening.startsAt.toISOString(),
        seats: row.seats
          .map(({ seat }) => seat)
          .sort(
            (a, b) =>
              a.rowLabel.localeCompare(b.rowLabel) ||
              a.seatNumber - b.seatNumber,
          ),
      }));
    },
    async create(userId, cinemaId, screeningId, seatIds, key) {
      const where = { userId_idempotencyKey: { userId, idempotencyKey: key } };
      const sorted = [...seatIds].sort();
      function previous(row: BookingRow) {
        const booking = present(row);
        return booking.screeningId === screeningId &&
          booking.seatIds.length === sorted.length &&
          booking.seatIds.every((seat, index) => seat === sorted[index])
          ? ({ status: 'ok', booking, replayed: true } as const)
          : ({ status: 'conflict' } as const);
      }
      try {
        return await database.$transaction(async (tx) => {
          const existing = await tx.cinemaBooking.findUnique({
            where,
            select: fields,
          });
          if (existing) return previous(existing);
          // Take the same per-user lock as the DB trigger before reading the
          // screening or claiming any seats. The trigger enforces the cap even
          // for writers that bypass this repository.
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
          const screening = await tx.screening.findFirst({
            where: {
              id: screeningId,
              auditorium: { cinemaId },
              status: 'PUBLISHED',
              startsAt: { gt: new Date() },
              bookingClosesAt: { gt: new Date() },
            },
            select: { auditoriumId: true },
          });
          if (!screening) return { status: 'not-found' } as const;
          // Serialize against new holds even for the legacy free-booking API.
          // The DB trigger repeats this check for writers outside this code.
          for (const seatId of sorted) {
            await tx.$queryRaw`SELECT "id" FROM "Seat" WHERE "id" = ${seatId}::uuid FOR UPDATE`;
          }
          const validSeats = await tx.seat.count({
            where: {
              id: { in: seatIds },
              auditoriumId: screening.auditoriumId,
              isActive: true,
            },
          });
          if (validSeats !== seatIds.length)
            return { status: 'taken' } as const;
          const heldSeats = await tx.cinemaHoldSeat.count({
            where: {
              screeningId,
              seatId: { in: sorted },
              hold: {
                OR: [
                  { status: 'CONFIRMED' },
                  {
                    status: { in: ['HOLDING', 'PAYMENT_FAILED'] },
                    expiresAt: { gt: new Date() },
                  },
                ],
              },
            },
          });
          if (heldSeats) return { status: 'taken' } as const;
          const owned = await tx.cinemaBookingSeat.count({
            where: { userId, screeningId },
          });
          const activeHolds = await tx.cinemaHoldSeat.count({
            where: {
              userId,
              screeningId,
              hold: {
                OR: [
                  { status: 'CONFIRMED' },
                  {
                    status: { in: ['HOLDING', 'PAYMENT_FAILED'] },
                    expiresAt: { gt: new Date() },
                  },
                ],
              },
            },
          });
          if (owned + activeHolds + seatIds.length > 10)
            return { status: 'limit' } as const;
          const created = await tx.cinemaBooking.create({
            data: { userId, screeningId, idempotencyKey: key },
            select: { id: true },
          });
          await tx.cinemaBookingSeat.createMany({
            data: sorted.map((seatId) => ({
              bookingId: created.id,
              userId,
              screeningId,
              seatId,
            })),
          });
          const row = await tx.cinemaBooking.findUniqueOrThrow({
            where: { id: created.id },
            select: fields,
          });
          return {
            status: 'ok',
            booking: present(row),
            replayed: false,
          } as const;
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const existing = await database.cinemaBooking.findUnique({
            where,
            select: fields,
          });
          if (existing) return previous(existing);
          return { status: 'taken' } as const;
        }
        // PostgreSQL check_violation raised by the DB guard, including via
        // Prisma's raw driver adapter (P2010), rolls the entire booking back.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2004' || error.code === 'P2010')
        ) {
          if (
            String(error.meta?.database_error ?? '').includes(
              'CinemaBookingSeat_limit_check',
            )
          )
            return { status: 'limit' } as const;
          if (
            String(error.meta?.database_error ?? '').includes(
              'CinemaBookingSeat_eligible_check',
            )
          )
            return { status: 'taken' } as const;
        }
        throw error;
      }
    },
  };
}
