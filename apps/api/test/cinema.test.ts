import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const cinemaId = 'a00af03a-4e20-44a9-8782-c0f671415199';
const screeningId = '43bccd6a-340a-42f0-8473-e90a06501370';
const cinema = {
  id: cinemaId,
  name: 'Demo Picture House',
  description: 'Fictional cinema',
  address: 'Imaginary Lane',
  timeZone: 'UTC',
  isDemo: true,
  imageUrl: null,
};
const screening = {
  id: screeningId,
  movie: {
    id: '7f0d0a96-8957-4c57-8e02-824549b18467',
    title: 'The Last Comet',
    synopsis: 'An imaginary adventure',
    durationMinutes: 110,
    posterUrl: null,
    releaseDate: null,
  },
  auditorium: {
    id: '41da62d9-3352-4d9e-a06a-927ee6da259b',
    name: 'Screen One',
  },
  startsAt: '2028-07-12T12:00:00.000Z',
  endsAt: '2028-07-12T14:00:00.000Z',
  bookingClosesAt: '2028-07-12T11:45:00.000Z',
  priceMinor: 1200,
  currency: 'USD',
  seats: [{ rowLabel: 'A', seatNumber: 1, category: 'STANDARD' }],
};
const reader = {
  list: vi.fn(),
  find: vi.fn(),
  screenings: vi.fn(),
  screening: vi.fn(),
};
let app: FastifyInstance;
afterEach(async () => {
  if (app) await app.close();
  vi.resetAllMocks();
});

describe('read-only cinema catalogue', () => {
  it('lists fictional cinemas and hides unknown cinemas', async () => {
    reader.list.mockResolvedValue([cinema]);
    reader.find.mockResolvedValue(null);
    app = buildApp({ checkDatabase: async () => true, cinemas: reader });
    expect((await app.inject('/cinemas')).json()).toEqual({
      cinemas: [cinema],
    });
    expect((await app.inject(`/cinemas/${cinemaId}`)).statusCode).toBe(404);
    expect((await app.inject('/cinemas/not-an-id')).statusCode).toBe(400);
  });

  it('shows independently scheduled showtimes and a read-only seat template', async () => {
    reader.find.mockResolvedValue(cinema);
    reader.screenings.mockResolvedValue([{ ...screening, seats: undefined }]);
    reader.screening.mockResolvedValue(screening);
    app = buildApp({ checkDatabase: async () => true, cinemas: reader });
    expect(
      (await app.inject(`/cinemas/${cinemaId}/screenings`)).json(),
    ).toEqual({ screenings: [{ ...screening, seats: undefined }] });
    expect(
      (
        await app.inject(`/cinemas/${cinemaId}/screenings/${screeningId}`)
      ).json(),
    ).toEqual(screening);
    expect(reader.screenings).toHaveBeenCalledWith(cinemaId);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/cinemas/${cinemaId}/screenings/${screeningId}/seats`,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('handles unavailable storage without exposing details', async () => {
    reader.list.mockRejectedValue(new Error('private database connection'));
    app = buildApp({ checkDatabase: async () => true, cinemas: reader });
    const response = await app.inject('/cinemas');
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('private database connection');
  });
});
