import type {
  PublicCinemaBooking,
  PublicCinemaBookingReceipt,
} from '@ticketforge/contracts';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';

export interface CinemaBookingRepository {
  list(userId: string): Promise<PublicCinemaBookingReceipt[]>;
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

export function createCinemaBookingRepository(
  database: PrismaClient,
): CinemaBookingRepository {
  return {
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
          const validSeats = await tx.seat.count({
            where: {
              id: { in: seatIds },
              auditoriumId: screening.auditoriumId,
              isActive: true,
            },
          });
          if (validSeats !== seatIds.length)
            return { status: 'taken' } as const;
          const owned = await tx.cinemaBookingSeat.count({
            where: { userId, screeningId },
          });
          if (owned + seatIds.length > 10) return { status: 'limit' } as const;
          const created = await tx.cinemaBooking.create({
            data: { userId, screeningId, idempotencyKey: key },
            select: { id: true },
          });
          await tx.cinemaBookingSeat.createMany({
            data: seatIds.map((seatId) => ({
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
          error.code === 'P2004'
        ) {
          if (
            String(error.meta?.database_error ?? '').includes(
              'CinemaBookingSeat_limit_check',
            )
          )
            return { status: 'limit' } as const;
          return { status: 'taken' } as const;
        }
        throw error;
      }
    },
  };
}
