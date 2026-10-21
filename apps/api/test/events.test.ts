import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const event = {
  id: '8dd0b3a5-7371-46a0-82be-1ee52a9dc8b5',
  title: 'Night at the Observatory',
  description: 'An evening under the stars.',
  venue: 'City Observatory',
  startsAt: '2027-07-12T19:00:00.000Z',
  endsAt: '2027-07-12T22:00:00.000Z',
  remainingSeats: 100,
};
const list = vi.fn();
const find = vi.fn();
let app: FastifyInstance;

afterEach(async () => {
  if (app) await app.close();
  vi.resetAllMocks();
});

function createApp() {
  app = buildApp({
    checkDatabase: async () => true,
    events: { list, find },
  });
}

describe('public event catalogue', () => {
  it('lists published events including both times', async () => {
    list.mockResolvedValue([event]);
    createApp();
    const response = await app.inject('/events');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ events: [event] });
  });

  it('returns an empty list when nothing is published', async () => {
    list.mockResolvedValue([]);
    createApp();
    expect((await app.inject('/events')).json()).toEqual({ events: [] });
  });

  it('returns the published event by id', async () => {
    find.mockResolvedValue(event);
    createApp();
    const response = await app.inject(`/events/${event.id}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(event);
  });

  it('hides missing or unpublished events', async () => {
    find.mockResolvedValue(null);
    createApp();
    const response = await app.inject(`/events/${event.id}`);
    expect(response.statusCode).toBe(404);
    expect(find).toHaveBeenCalledWith(event.id);
  });

  it('rejects malformed ids without querying the database', async () => {
    createApp();
    const response = await app.inject('/events/not-an-id');
    expect(response.statusCode).toBe(400);
    expect(find).not.toHaveBeenCalled();
  });

  it('does not expose database errors', async () => {
    list.mockRejectedValue(new Error('private_password'));
    createApp();
    const response = await app.inject('/events');
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('private_password');
  });

  it('does not expose lookup errors', async () => {
    find.mockRejectedValue(new Error('private_password'));
    createApp();
    const response = await app.inject(`/events/${event.id}`);
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('private_password');
  });
});
