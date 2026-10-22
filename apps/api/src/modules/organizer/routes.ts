import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthRepository } from '../auth/repository.js';
import type {
  EventInput,
  EventPatch,
  OrganizerRepository,
} from './repository.js';

const uuid =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const params = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: uuid } },
} as const;
const properties = {
  title: { type: 'string', minLength: 1, maxLength: 160 },
  description: { type: 'string', minLength: 1, maxLength: 4000 },
  venue: { type: 'string', minLength: 1, maxLength: 200 },
  startsAt: { type: 'string', minLength: 20, maxLength: 35 },
  endsAt: { type: 'string', minLength: 20, maxLength: 35 },
  capacity: { type: 'integer', minimum: 0, maximum: 1000000 },
} as const;
const body = {
  type: 'object',
  additionalProperties: false,
  properties,
} as const;
const createSchema = {
  ...body,
  required: ['title', 'description', 'venue', 'startsAt', 'endsAt', 'capacity'],
} as const;
const patchSchema = { ...body, minProperties: 1 } as const;
function validDate(value: string): boolean {
  return (
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 19) === value.slice(0, 19)
  );
}
function valid(input: EventPatch): boolean {
  if (
    ['title', 'description', 'venue'].some((key) => {
      const value = input[key as keyof EventPatch];
      return typeof value === 'string' && !value.trim();
    })
  )
    return false;
  return (
    (!input.startsAt || validDate(input.startsAt)) &&
    (!input.endsAt || validDate(input.endsAt)) &&
    (!input.startsAt ||
      !input.endsAt ||
      Date.parse(input.startsAt) < Date.parse(input.endsAt))
  );
}

export function registerOrganizerRoutes(
  app: FastifyInstance,
  organizers: OrganizerRepository,
  sessions: Pick<AuthRepository, 'findSession'>,
): void {
  async function authorize(
    request: FastifyRequest,
    reply: import('fastify').FastifyReply,
  ): Promise<string | null> {
    const header = request.headers.authorization;
    if (!header || !/^Bearer [a-f0-9]{64}$/.test(header)) {
      reply.code(401).send({ error: 'Unauthorized' });
      return null;
    }
    const user = await sessions.findSession(
      createHash('sha256').update(header.slice(7)).digest('hex'),
    );
    if (!user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return null;
    }
    if (user.role !== 'ORGANIZER') {
      reply.code(403).send({ error: 'Forbidden' });
      return null;
    }
    return user.id;
  }
  async function handle(
    request: FastifyRequest,
    reply: import('fastify').FastifyReply,
    work: (id: string) => Promise<unknown>,
  ) {
    try {
      const userId = await authorize(request, reply);
      if (!userId) return;
      return await work(userId);
    } catch (error) {
      request.log.error({ err: error }, 'Organizer operation failed');
      return reply.code(503).send({ error: 'Event management unavailable' });
    }
  }
  function outcome(
    result: Awaited<ReturnType<OrganizerRepository['update']>>,
    reply: import('fastify').FastifyReply,
  ) {
    if (result.status === 'ok') return result.event;
    if (result.status === 'not-found')
      return reply.code(404).send({ error: 'Event not found' });
    return reply.code(409).send({ error: 'Event cannot be changed' });
  }
  app.get('/organizer/events', (request, reply) =>
    handle(request, reply, async (id) => ({
      events: await organizers.list(id),
    })),
  );
  app.post<{ Body: EventInput }>(
    '/organizer/events',
    { schema: { body: createSchema } },
    (request, reply) =>
      handle(request, reply, async (id) => {
        if (
          !valid(request.body) ||
          Date.parse(request.body.startsAt) <= Date.now()
        )
          return reply.code(400).send({ error: 'Invalid event schedule' });
        return reply.code(201).send(await organizers.create(id, request.body));
      }),
  );
  app.get<{ Params: { id: string } }>(
    '/organizer/events/:id',
    { schema: { params } },
    (request, reply) =>
      handle(
        request,
        reply,
        async (id) =>
          (await organizers.find(id, request.params.id)) ??
          reply.code(404).send({ error: 'Event not found' }),
      ),
  );
  app.patch<{ Params: { id: string }; Body: EventPatch }>(
    '/organizer/events/:id',
    { schema: { params, body: patchSchema } },
    (request, reply) =>
      handle(request, reply, async (id) => {
        if (!valid(request.body))
          return reply.code(400).send({ error: 'Invalid event details' });
        return outcome(
          await organizers.update(id, request.params.id, request.body),
          reply,
        );
      }),
  );
  for (const action of ['publish', 'unpublish'] as const) {
    app.post<{ Params: { id: string } }>(
      `/organizer/events/:id/${action}`,
      { schema: { params } },
      (request, reply) =>
        handle(request, reply, async (id) =>
          outcome(await organizers[action](id, request.params.id), reply),
        ),
    );
  }
}
