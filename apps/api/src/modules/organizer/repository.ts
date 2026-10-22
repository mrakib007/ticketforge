import type { OrganizerEvent } from '@ticketforge/contracts';
import type { PrismaClient } from '../../generated/prisma/client.js';

export interface EventInput {
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
}
export type EventPatch = Partial<EventInput>;
type Outcome =
  | { status: 'ok'; event: OrganizerEvent }
  | { status: 'not-found' | 'conflict' };

export interface OrganizerRepository {
  list(userId: string): Promise<OrganizerEvent[]>;
  find(userId: string, id: string): Promise<OrganizerEvent | null>;
  create(userId: string, input: EventInput): Promise<OrganizerEvent>;
  update(userId: string, id: string, input: EventPatch): Promise<Outcome>;
  publish(userId: string, id: string): Promise<Outcome>;
  unpublish(userId: string, id: string): Promise<Outcome>;
}

const fields = {
  id: true,
  title: true,
  description: true,
  venue: true,
  startsAt: true,
  endsAt: true,
  capacity: true,
  bookedSeats: true,
  published: true,
  _count: { select: { bookings: { where: { cancelledAt: null } } } },
} as const;

type Row = {
  id: string;
  title: string;
  description: string;
  venue: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  bookedSeats: number;
  published: boolean;
  _count: { bookings: number };
};
function present(row: Row, cancelledBookings: number): OrganizerEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    venue: row.venue,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    capacity: row.capacity,
    bookedSeats: row.bookedSeats,
    remainingSeats: row.capacity - row.bookedSeats,
    published: row.published,
    activeBookings: row._count.bookings,
    cancelledBookings,
  };
}

export function createOrganizerRepository(
  database: PrismaClient,
): OrganizerRepository {
  async function find(
    userId: string,
    id: string,
  ): Promise<OrganizerEvent | null> {
    const row = await database.event.findFirst({
      where: { id, organizerId: userId },
      select: fields,
    });
    return row
      ? present(
          row,
          await database.booking.count({
            where: { eventId: id, cancelledAt: { not: null } },
          }),
        )
      : null;
  }
  // Lock the Event row also used by the booking UPDATE and cancellation UPDATE.
  // All policy checks and writes run under that lock on the authoritative database.
  async function change(
    userId: string,
    id: string,
    patch: EventPatch | null,
    publication?: boolean,
  ): Promise<Outcome> {
    return database.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<
        {
          id: string;
          capacity: number;
          bookedSeats: number;
          published: boolean;
          startsAt: Date;
          endsAt: Date;
          now: Date;
        }[]
      >`
        SELECT "id", "capacity", "bookedSeats", "published", "startsAt", "endsAt", clock_timestamp() AS now
        FROM "Event" WHERE "id" = ${id}::uuid AND "organizerId" = ${userId}::uuid FOR UPDATE`;
      if (!locked) return { status: 'not-found' };
      if (locked.startsAt <= locked.now) return { status: 'conflict' };
      if (patch) {
        if (patch.capacity !== undefined && patch.capacity < locked.bookedSeats)
          return { status: 'conflict' };
        if (
          locked.bookedSeats > 0 &&
          ((patch.capacity !== undefined && patch.capacity < locked.capacity) ||
            patch.startsAt !== undefined ||
            patch.endsAt !== undefined ||
            patch.venue !== undefined)
        )
          return { status: 'conflict' };
        const start = patch.startsAt
          ? new Date(patch.startsAt)
          : locked.startsAt;
        const end = patch.endsAt ? new Date(patch.endsAt) : locked.endsAt;
        if (start <= locked.now || end <= start) return { status: 'conflict' };
      }
      if (publication === false && locked.bookedSeats > 0)
        return { status: 'conflict' };
      const row = await tx.event.update({
        where: { id },
        data: {
          ...(patch ?? {}),
          ...(patch?.startsAt ? { startsAt: new Date(patch.startsAt) } : {}),
          ...(patch?.endsAt ? { endsAt: new Date(patch.endsAt) } : {}),
          ...(publication === undefined ? {} : { published: publication }),
        },
        select: fields,
      });
      return {
        status: 'ok',
        event: present(
          row,
          await tx.booking.count({
            where: { eventId: id, cancelledAt: { not: null } },
          }),
        ),
      };
    });
  }
  return {
    async list(userId) {
      const rows = await database.event.findMany({
        where: { organizerId: userId },
        select: fields,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: 50,
      });
      const counts = rows.length
        ? await database.booking.groupBy({
            by: ['eventId'],
            where: {
              eventId: { in: rows.map((row) => row.id) },
              cancelledAt: { not: null },
            },
            _count: { _all: true },
          })
        : [];
      const cancelled = new Map(
        counts.map((row) => [row.eventId, row._count._all]),
      );
      return rows.map((row) => present(row, cancelled.get(row.id) ?? 0));
    },
    find,
    async create(userId, input) {
      return present(
        await database.event.create({
          data: {
            ...input,
            startsAt: new Date(input.startsAt),
            endsAt: new Date(input.endsAt),
            organizerId: userId,
          },
          select: fields,
        }),
        0,
      );
    },
    update: (userId, id, input) => change(userId, id, input),
    publish: (userId, id) => change(userId, id, null, true),
    unpublish: (userId, id) => change(userId, id, null, false),
  };
}
