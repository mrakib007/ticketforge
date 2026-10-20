import type { FastifyInstance } from 'fastify';
import type { EventListResponse, PublicEvent } from '@ticketforge/contracts';
import type { EventReader } from './repository.js';

const uuid =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

export function registerEventRoutes(
  app: FastifyInstance,
  events: EventReader,
): void {
  app.get<{ Reply: EventListResponse | { error: string } }>(
    '/events',
    async (request, reply) => {
      try {
        return { events: await events.list() };
      } catch (error) {
        request.log.error({ err: error }, 'Event list failed');
        return reply.code(503).send({ error: 'Catalogue unavailable' });
      }
    },
  );

  app.get<{ Params: { id: string }; Reply: PublicEvent | { error: string } }>(
    '/events/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: uuid } },
        },
      },
    },
    async (request, reply) => {
      try {
        const event = await events.find(request.params.id);
        return event ?? reply.code(404).send({ error: 'Event not found' });
      } catch (error) {
        request.log.error({ err: error }, 'Event lookup failed');
        return reply.code(503).send({ error: 'Catalogue unavailable' });
      }
    },
  );
}
