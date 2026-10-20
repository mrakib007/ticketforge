import type { PublicEvent } from '@ticketforge/contracts';
import type { PrismaClient } from '../../generated/prisma/client.js';

export interface EventReader {
  list(): Promise<PublicEvent[]>;
  find(id: string): Promise<PublicEvent | null>;
}

const publicFields = {
  id: true,
  title: true,
  description: true,
  venue: true,
  startsAt: true,
  endsAt: true,
} as const;

type EventRow = {
  id: string;
  title: string;
  description: string;
  venue: string;
  startsAt: Date;
  endsAt: Date;
};

function toPublicEvent(row: EventRow): PublicEvent {
  return {
    ...row,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
  };
}

export function createEventReader(database: PrismaClient): EventReader {
  return {
    async list() {
      const rows = await database.event.findMany({
        where: { published: true, startsAt: { gte: new Date() } },
        select: publicFields,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: 50,
      });
      return rows.map(toPublicEvent);
    },
    async find(id) {
      const row = await database.event.findFirst({
        where: { id, published: true },
        select: publicFields,
      });
      return row ? toPublicEvent(row) : null;
    },
  };
}
