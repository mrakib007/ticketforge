import type { PublicBooking } from '@ticketforge/contracts';
import type { PrismaClient } from '../../generated/prisma/client.js';

export interface BookingRepository {
  create(
    userId: string,
    eventId: string,
    quantity: number,
  ): Promise<
    | { status: 'ok'; booking: PublicBooking }
    | { status: 'not-found' }
    | { status: 'sold-out' }
  >;
  list(userId: string): Promise<PublicBooking[]>;
}

const bookingFields = {
  id: true,
  eventId: true,
  quantity: true,
  createdAt: true,
  event: { select: { title: true, venue: true, startsAt: true, endsAt: true } },
} as const;

type BookingRow = {
  id: string;
  eventId: string;
  quantity: number;
  createdAt: Date;
  event: { title: string; venue: string; startsAt: Date; endsAt: Date };
};

function toPublicBooking(row: BookingRow): PublicBooking {
  return {
    id: row.id,
    eventId: row.eventId,
    quantity: row.quantity,
    createdAt: row.createdAt.toISOString(),
    event: {
      ...row.event,
      startsAt: row.event.startsAt.toISOString(),
      endsAt: row.event.endsAt.toISOString(),
    },
  };
}

export function createBookingRepository(
  database: PrismaClient,
): BookingRepository {
  return {
    async create(userId, eventId, quantity) {
      return database.$transaction(async (tx) => {
        // The conditional UPDATE locks this event row. Concurrent bookings cannot
        // both claim its final seats, even across separate API instances.
        const claimed = await tx.$executeRaw`
          UPDATE "Event"
          SET "bookedSeats" = "bookedSeats" + ${quantity}
          WHERE "id" = ${eventId}::uuid AND "published" = true
            AND "startsAt" > NOW()
            AND "bookedSeats" <= "capacity" - ${quantity}
        `;
        if (claimed === 0) {
          const event = await tx.event.findFirst({
            where: {
              id: eventId,
              published: true,
              startsAt: { gt: new Date() },
            },
            select: { id: true },
          });
          return { status: event ? 'sold-out' : 'not-found' } as const;
        }
        const booking = await tx.booking.create({
          data: { userId, eventId, quantity },
          select: bookingFields,
        });
        return { status: 'ok', booking: toPublicBooking(booking) } as const;
      });
    },
    async list(userId) {
      const rows = await database.booking.findMany({
        where: { userId },
        select: bookingFields,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
      });
      return rows.map(toPublicBooking);
    },
  };
}
