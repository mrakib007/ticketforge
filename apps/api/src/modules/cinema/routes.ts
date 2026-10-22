import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { CinemaReader } from './repository.js';

const uuid =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const params = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: uuid } },
} as const;
const detailParams = {
  type: 'object',
  required: ['id', 'screeningId'],
  properties: {
    id: { type: 'string', pattern: uuid },
    screeningId: { type: 'string', pattern: uuid },
  },
} as const;

export function registerCinemaRoutes(
  app: FastifyInstance,
  cinemas: CinemaReader,
): void {
  async function read(
    request: FastifyRequest,
    reply: FastifyReply,
    work: () => Promise<unknown>,
  ) {
    try {
      return await work();
    } catch (error) {
      request.log.error({ err: error }, 'Cinema catalogue lookup failed');
      return reply.code(503).send({ error: 'Cinema catalogue unavailable' });
    }
  }
  app.get('/cinemas', (request, reply) =>
    read(request, reply, async () => ({ cinemas: await cinemas.list() })),
  );
  app.get<{ Params: { id: string } }>(
    '/cinemas/:id',
    { schema: { params } },
    (request, reply) =>
      read(
        request,
        reply,
        async () =>
          (await cinemas.find(request.params.id)) ??
          reply.code(404).send({ error: 'Cinema not found' }),
      ),
  );
  app.get<{ Params: { id: string } }>(
    '/cinemas/:id/screenings',
    { schema: { params } },
    (request, reply) =>
      read(request, reply, async () => {
        if (!(await cinemas.find(request.params.id)))
          return reply.code(404).send({ error: 'Cinema not found' });
        return { screenings: await cinemas.screenings(request.params.id) };
      }),
  );
  app.get<{ Params: { id: string; screeningId: string } }>(
    '/cinemas/:id/screenings/:screeningId',
    { schema: { params: detailParams } },
    (request, reply) =>
      read(
        request,
        reply,
        async () =>
          (await cinemas.screening(
            request.params.id,
            request.params.screeningId,
          )) ?? reply.code(404).send({ error: 'Screening not found' }),
      ),
  );
}
