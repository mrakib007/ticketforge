import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthResponse, PublicUser } from '@ticketforge/contracts';
import type { AuthRepository } from './repository.js';
import { hashPassword, verifyPassword } from './password.js';
import type { AuthRateLimiter } from './rate-limit.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sessionDays = 7;
const credentialsSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', minLength: 3, maxLength: 254 },
      password: { type: 'string', minLength: 12, maxLength: 1024 },
    },
  },
} as const;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function tokenFrom(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  return header && /^Bearer [a-f0-9]{64}$/.test(header)
    ? header.slice(7)
    : null;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  auth: AuthRepository,
  rateLimiter?: AuthRateLimiter,
): void {
  async function limit(
    request: FastifyRequest,
    reply: import('fastify').FastifyReply,
    mode: 'login' | 'register',
  ) {
    if (!rateLimiter) return;
    try {
      const body = request.body as { email: string };
      const retryAfter = await rateLimiter.check(request, mode, body.email);
      if (retryAfter > 0) {
        return reply
          .header('Retry-After', String(retryAfter))
          .code(429)
          .send({ error: 'Too many attempts. Try again later.' });
      }
    } catch (error) {
      request.log.error({ err: error }, 'Auth rate limit unavailable');
      return reply.code(503).send({ error: 'Authentication unavailable' });
    }
  }
  async function issueSession(user: PublicUser): Promise<AuthResponse> {
    const token = randomBytes(32).toString('hex');
    await auth.createSession(
      user.id,
      hashToken(token),
      new Date(Date.now() + sessionDays * 86_400_000),
    );
    return { user, token };
  }

  app.post<{ Body: { email: string; password: string } }>(
    '/auth/register',
    {
      schema: credentialsSchema,
      preHandler: (request, reply) => limit(request, reply, 'register'),
    },
    async (request, reply) => {
      const email = request.body.email.trim().toLowerCase();
      if (!emailPattern.test(email) || email.length > 254)
        return reply.code(400).send({ error: 'Invalid email' });
      try {
        const token = randomBytes(32).toString('hex');
        const user = await auth.register(
          email,
          await hashPassword(request.body.password),
          hashToken(token),
          new Date(Date.now() + sessionDays * 86_400_000),
        );
        if (!user)
          return reply.code(409).send({ error: 'Account already exists' });
        return reply.code(201).send({ user, token });
      } catch (error) {
        request.log.error({ err: error }, 'Registration failed');
        return reply.code(503).send({ error: 'Authentication unavailable' });
      }
    },
  );

  app.post<{ Body: { email: string; password: string } }>(
    '/auth/login',
    {
      schema: credentialsSchema,
      preHandler: (request, reply) => limit(request, reply, 'login'),
    },
    async (request, reply) => {
      const email = request.body.email.trim().toLowerCase();
      if (!emailPattern.test(email) || email.length > 254)
        return reply.code(400).send({ error: 'Invalid email' });
      try {
        const user = await auth.findUser(email);
        // Perform a real KDF even for unknown accounts to reduce account enumeration by timing.
        const valid = await verifyPassword(
          request.body.password,
          user?.passwordHash ?? dummyHash,
        );
        if (!user || !valid)
          return reply.code(401).send({ error: 'Invalid credentials' });
        return reply.send(
          await issueSession({ id: user.id, email: user.email }),
        );
      } catch (error) {
        request.log.error({ err: error }, 'Login failed');
        return reply.code(503).send({ error: 'Authentication unavailable' });
      }
    },
  );

  app.get('/auth/me', async (request, reply) => {
    const token = tokenFrom(request);
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });
    try {
      const user = await auth.findSession(hashToken(token));
      return user ? { user } : reply.code(401).send({ error: 'Unauthorized' });
    } catch (error) {
      request.log.error({ err: error }, 'Session lookup failed');
      return reply.code(503).send({ error: 'Authentication unavailable' });
    }
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = tokenFrom(request);
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });
    try {
      await auth.deleteSession(hashToken(token));
      return reply.code(204).send();
    } catch (error) {
      request.log.error({ err: error }, 'Logout failed');
      return reply.code(503).send({ error: 'Authentication unavailable' });
    }
  });
}

// Fixed salt/hash of a non-secret dummy password, only used for unknown accounts.
const dummyHash =
  '0000000000000000000000000000000000000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
