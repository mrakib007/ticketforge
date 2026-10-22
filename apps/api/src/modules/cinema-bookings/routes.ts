import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AuthRepository } from '../auth/repository.js';
import type { CinemaBookingRepository } from './repository.js';

const uuid =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const keyPattern =
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

export function registerCinemaBookingRoutes(
  app: FastifyInstance,
  bookings: CinemaBookingRepository,
  sessions: Pick<AuthRepository, 'findSession'>,
): void {
  app.get('/cinema-bookings', async (request, reply) => {
    try {
      const auth = request.headers.authorization;
      if (!auth || !/^Bearer [a-f0-9]{64}$/.test(auth))
        return reply.code(401).send({ error: 'Unauthorized' });
      const user = await sessions.findSession(
        createHash('sha256').update(auth.slice(7)).digest('hex'),
      );
      if (!user) return reply.code(401).send({ error: 'Unauthorized' });
      return { bookings: await bookings.list(user.id) };
    } catch (err) {
      request.log.error({ err }, 'Cinema booking list failed');
      return reply.code(503).send({ error: 'Cinema booking unavailable' });
    }
  });
  app.post<{
    Params: { id: string; screeningId: string };
    Body: { seatIds: string[] };
  }>(
    '/cinemas/:id/screenings/:screeningId/bookings',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id', 'screeningId'],
          properties: {
            id: { type: 'string', pattern: uuid },
            screeningId: { type: 'string', pattern: uuid },
          },
        },
        headers: {
          type: 'object',
          required: ['idempotency-key'],
          properties: {
            'idempotency-key': { type: 'string', pattern: keyPattern },
          },
        },
        body: {
          type: 'object',
          required: ['seatIds'],
          additionalProperties: false,
          properties: {
            seatIds: {
              type: 'array',
              minItems: 1,
              maxItems: 10,
              uniqueItems: true,
              items: { type: 'string', pattern: uuid },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const auth = request.headers.authorization;
        if (!auth || !/^Bearer [a-f0-9]{64}$/.test(auth))
          return reply.code(401).send({ error: 'Unauthorized' });
        const user = await sessions.findSession(
          createHash('sha256').update(auth.slice(7)).digest('hex'),
        );
        if (!user) return reply.code(401).send({ error: 'Unauthorized' });
        const key = request.headers['idempotency-key'];
        if (typeof key !== 'string')
          return reply.code(400).send({ error: 'Invalid idempotency key' });
        const result = await bookings.create(
          user.id,
          request.params.id,
          request.params.screeningId,
          request.body.seatIds,
          key,
        );
        if (result.status === 'not-found')
          return reply
            .code(404)
            .send({ error: 'Screening not open for booking' });
        if (result.status === 'taken')
          return reply
            .code(409)
            .send({ error: 'Selected seats are unavailable' });
        if (result.status === 'limit')
          return reply.code(409).send({
            error: 'Maximum 10 tickets per person for this screening',
          });
        if (result.status === 'conflict')
          return reply
            .code(409)
            .send({ error: 'Idempotency key used for another booking' });
        if (result.status !== 'ok')
          return reply.code(503).send({ error: 'Cinema booking unavailable' });
        return reply.code(result.replayed ? 200 : 201).send(result.booking);
      } catch (err) {
        request.log.error({ err }, 'Cinema seat booking failed');
        return reply.code(503).send({ error: 'Cinema booking unavailable' });
      }
    },
  );
}
