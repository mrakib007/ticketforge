import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const owner = {
  id: '8dd0b3a5-7371-46a0-82be-1ee52a9dc8b5',
  email: 'host@example.com',
  role: 'ORGANIZER' as const,
};
const attendee = { ...owner, role: 'ATTENDEE' as const };
const eventId = '870b5d13-978e-4557-8905-b59c3dfd9a95';
const token = 'a'.repeat(64);
const headers = { authorization: `Bearer ${token}` };
const draft = {
  title: 'Concert',
  description: 'Live show',
  venue: 'Hall',
  startsAt: '2028-07-12T19:00:00.000Z',
  endsAt: '2028-07-12T22:00:00.000Z',
  capacity: 100,
};
const sessions = { findSession: vi.fn() };
const organizers = {
  list: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
};
let app: FastifyInstance;

afterEach(async () => {
  if (app) await app.close();
  vi.resetAllMocks();
});
function setup() {
  app = buildApp({
    checkDatabase: async () => true,
    sessionReader: sessions,
    organizers,
  });
}

describe('organizer event API', () => {
  it('requires an authenticated organizer', async () => {
    setup();
    expect((await app.inject('/organizer/events')).statusCode).toBe(401);
    sessions.findSession.mockResolvedValue(attendee);
    expect(
      (await app.inject({ url: '/organizer/events', headers })).statusCode,
    ).toBe(403);
    expect(organizers.list).not.toHaveBeenCalled();
  });

  it('creates only an owned draft and rejects privileged fields', async () => {
    sessions.findSession.mockResolvedValue(owner);
    organizers.create.mockResolvedValue({
      id: eventId,
      ...draft,
      published: false,
      bookedSeats: 0,
    });
    setup();
    const created = await app.inject({
      method: 'POST',
      url: '/organizer/events',
      headers,
      payload: draft,
    });
    expect(created.statusCode).toBe(201);
    expect(organizers.create).toHaveBeenCalledWith(owner.id, draft);
    for (const field of ['organizerId', 'published', 'bookedSeats', 'role']) {
      const response = await app.inject({
        method: 'POST',
        url: '/organizer/events',
        headers,
        payload: { ...draft, [field]: field === 'published' ? true : 1 },
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it('rejects invalid schedules and hides events owned by others', async () => {
    sessions.findSession.mockResolvedValue(owner);
    organizers.find.mockResolvedValue(null);
    setup();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/organizer/events',
          headers,
          payload: { ...draft, endsAt: draft.startsAt },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ url: `/organizer/events/${eventId}`, headers }))
        .statusCode,
    ).toBe(404);
    expect(organizers.find).toHaveBeenCalledWith(owner.id, eventId);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/organizer/events',
          headers,
          payload: { ...draft, startsAt: '2028-02-30T19:00:00.000Z' },
        })
      ).statusCode,
    ).toBe(400);
  });

  it('returns conflicts for unsafe edits and publication', async () => {
    sessions.findSession.mockResolvedValue(owner);
    organizers.update.mockResolvedValue({ status: 'conflict' });
    organizers.publish.mockResolvedValue({ status: 'conflict' });
    setup();
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/organizer/events/${eventId}`,
          headers,
          payload: { capacity: 1 },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/organizer/events/${eventId}/publish`,
          headers,
        })
      ).statusCode,
    ).toBe(409);
  });
});
