import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PublicUser } from '@ticketforge/contracts';
import type { AuthRepository } from '../auth/repository.js';
import type { BookingRepository } from './repository.js';

const uuid =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const keyPattern =
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

export function registerBookingRoutes(
  app: FastifyInstance,
  bookings: BookingRepository,
  sessions: Pick<AuthRepository, 'findSession'>,
): void {
  async function identify(request: FastifyRequest): Promise<PublicUser | null> {
    const token = request.headers.authorization;
    if (!token || !/^Bearer [a-f0-9]{64}$/.test(token)) return null;
    const hash = createHash('sha256').update(token.slice(7)).digest('hex');
    return sessions.findSession(hash);
  }

  app.post<{ Body: { eventId: string; quantity: number } }>(
    '/bookings',
    {
      schema: {
        headers: {
          type: 'object',
          required: ['idempotency-key'],
          properties: {
            'idempotency-key': { type: 'string', pattern: keyPattern },
          },
        },
        body: {
          type: 'object',
          required: ['eventId', 'quantity'],
          additionalProperties: false,
          properties: {
            eventId: { type: 'string', pattern: uuid },
            quantity: { type: 'integer', minimum: 1, maximum: 10 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await identify(request);
        if (!user) return reply.code(401).send({ error: 'Unauthorized' });
        const key = request.headers['idempotency-key'];
        if (typeof key !== 'string' || !new RegExp(keyPattern).test(key))
          return reply.code(400).send({ error: 'Invalid idempotency key' });
        const result = await bookings.create(
          user.id,
          request.body.eventId,
          request.body.quantity,
          key,
        );
        if (result.status === 'conflict')
          return reply
            .code(409)
            .send({ error: 'Idempotency key used for another booking' });
        if (result.status === 'not-found')
          return reply.code(404).send({ error: 'Event not found' });
        if (result.status === 'sold-out')
          return reply.code(409).send({ error: 'Not enough seats available' });
        return reply.code(result.replayed ? 200 : 201).send(result.booking);
      } catch (err) {
        request.log.error({ err }, 'Booking failed');
        return reply.code(503).send({ error: 'Bookings unavailable' });
      }
    },
  );

  app.get('/bookings', async (request, reply) => {
    try {
      const user = await identify(request);
      if (!user) return reply.code(401).send({ error: 'Unauthorized' });
      return { bookings: await bookings.list(user.id) };
    } catch (err) {
      request.log.error({ err }, 'Booking list failed');
      return reply.code(503).send({ error: 'Bookings unavailable' });
    }
  });
}
