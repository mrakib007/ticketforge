import type {
  PublicCinema,
  PublicScreening,
  PublicScreeningDetail,
} from '@ticketforge/contracts';
import type { PrismaClient } from '../../generated/prisma/client.js';

export interface CinemaReader {
  list(): Promise<PublicCinema[]>;
  find(id: string): Promise<PublicCinema | null>;
  screenings(cinemaId: string): Promise<PublicScreening[]>;
  screening(
    cinemaId: string,
    screeningId: string,
  ): Promise<PublicScreeningDetail | null>;
}

const cinemaFields = {
  id: true,
  name: true,
  description: true,
  address: true,
  timeZone: true,
  imageUrl: true,
  isDemo: true,
} as const;
const screeningFields = {
  id: true,
  startsAt: true,
  endsAt: true,
  bookingClosesAt: true,
  priceMinor: true,
  currency: true,
  movie: {
    select: {
      id: true,
      title: true,
      synopsis: true,
      durationMinutes: true,
      posterUrl: true,
      releaseDate: true,
    },
  },
  auditorium: { select: { id: true, name: true } },
} as const;

type ScreeningRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  bookingClosesAt: Date;
  priceMinor: number;
  currency: string;
  movie: {
    id: string;
    title: string;
    synopsis: string;
    durationMinutes: number;
    posterUrl: string | null;
    releaseDate: Date | null;
  };
  auditorium: { id: string; name: string };
};

function present(row: ScreeningRow): PublicScreening {
  return {
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    bookingClosesAt: row.bookingClosesAt.toISOString(),
    priceMinor: row.priceMinor,
    currency: row.currency,
    auditorium: row.auditorium,
    movie: {
      ...row.movie,
      releaseDate: row.movie.releaseDate?.toISOString().slice(0, 10) ?? null,
    },
  };
}

export function createCinemaReader(database: PrismaClient): CinemaReader {
  return {
    list: () =>
      database.cinema.findMany({
        select: cinemaFields,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 50,
      }),
    find: (id) =>
      database.cinema.findUnique({ where: { id }, select: cinemaFields }),
    async screenings(cinemaId) {
      const rows = await database.screening.findMany({
        where: {
          auditorium: { cinemaId },
          status: 'PUBLISHED',
          startsAt: { gt: new Date() },
        },
        select: screeningFields,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: 50,
      });
      return rows.map(present);
    },
    async screening(cinemaId, screeningId) {
      const row = await database.screening.findFirst({
        where: {
          id: screeningId,
          auditorium: { cinemaId },
          status: 'PUBLISHED',
          startsAt: { gt: new Date() },
        },
        select: {
          ...screeningFields,
          auditorium: {
            select: {
              id: true,
              name: true,
              seats: {
                where: { isActive: true },
                select: {
                  id: true,
                  rowLabel: true,
                  seatNumber: true,
                  category: true,
                  reservations: {
                    where: { screeningId },
                    select: { seatId: true },
                    take: 1,
                  },
                },
                orderBy: [{ rowLabel: 'asc' }, { seatNumber: 'asc' }],
                take: 500,
              },
            },
          },
        },
      });
      if (!row) return null;
      const { seats, ...auditorium } = row.auditorium;
      return {
        ...present({ ...row, auditorium }),
        seats: seats.map(({ reservations, ...seat }) => ({
          ...seat,
          booked: reservations.length > 0,
        })),
      };
    },
  };
}
