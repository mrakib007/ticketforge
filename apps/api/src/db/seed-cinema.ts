import { createHash } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';

// Stable IDs make re-running the demo seed safe without overwriting edits.
function demoId(value: string): string {
  const hex = createHash('sha256')
    .update(`ticketforge-cinema:${value}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const demoCinemaId = demoId('cinema');
const auditoriumId = demoId('auditorium');
const movies = [
  [
    'The Last Comet',
    'A night-shift astronomer discovers a message in the stars.',
    110,
  ],
  ['Paper Kingdom', 'Two siblings draw a world that comes to life.', 104],
  [
    'Echoes of Tomorrow',
    'A radio operator receives broadcasts from next week.',
    118,
  ],
  ['The Garden Below', 'An underground garden changes a city above.', 96],
  [
    'Across the Blue',
    'A crew sails towards an island missing from every map.',
    112,
  ],
  [
    'Midnight Parcel',
    'A courier has one night to deliver an impossible package.',
    101,
  ],
] as const;

export async function seedCinema(
  database: PrismaClient,
  now = new Date(),
): Promise<void> {
  // These names, address and prices are wholly fictional and are not real tickets.
  const firstDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  await database.$transaction(async (tx) => {
    await tx.cinema.createMany({
      data: [
        {
          id: demoCinemaId,
          name: 'TicketForge Demo Picture House',
          description:
            'A fictional cinema for exploring upcoming screenings. No tickets are sold here.',
          address: 'Fictional address · online demo',
          timeZone: 'UTC',
          isDemo: true,
        },
      ],
      skipDuplicates: true,
    });
    await tx.auditorium.createMany({
      data: [{ id: auditoriumId, cinemaId: demoCinemaId, name: 'Screen One' }],
      skipDuplicates: true,
    });
    await tx.movie.createMany({
      data: movies.map(([title, synopsis, durationMinutes]) => ({
        id: demoId(`movie:${title}`),
        title,
        synopsis,
        durationMinutes,
      })),
      skipDuplicates: true,
    });
    await tx.seat.createMany({
      data: Array.from({ length: 100 }, (_, index) => ({
        id: demoId(`seat:${index}`),
        auditoriumId,
        rowLabel: String.fromCharCode(65 + Math.floor(index / 10)),
        seatNumber: (index % 10) + 1,
      })),
      skipDuplicates: true,
    });
    const screenings = Array.from({ length: 7 }, (_, day) =>
      [10, 13, 16, 19].map((hour, slot) => {
        const startsAt = new Date(
          firstDay.getTime() + day * 86_400_000 + hour * 3_600_000,
        );
        return {
          id: demoId(`screening:${startsAt.toISOString()}`),
          auditoriumId,
          movieId: demoId(
            `movie:${movies[(day * 4 + slot) % movies.length]![0]}`,
          ),
          startsAt,
          endsAt: new Date(startsAt.getTime() + 120 * 60_000),
          bookingClosesAt: new Date(startsAt.getTime() - 15 * 60_000),
          priceMinor: 1200,
          currency: 'USD',
          status: 'PUBLISHED' as const,
        };
      }),
    ).flat();
    await tx.screening.createMany({ data: screenings, skipDuplicates: true });
  });
}
