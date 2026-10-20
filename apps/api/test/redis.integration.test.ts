import { RedisContainer } from '@testcontainers/redis';
import { expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { createAuthRateLimiter } from '../src/modules/auth/rate-limit.js';
import { createRedisRateLimitStore } from '../src/modules/auth/redis-rate-limit.js';

it('atomically limits auth requests and expires counters using real Redis', async () => {
  const container = await new RedisContainer('redis:7.4.5-alpine').start();
  const redis = createRedisRateLimitStore(container.getConnectionUrl());
  let stopped = false;
  try {
    await redis.connect();

    const key = 'auth:test:concurrent';
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () => redis.store.consume([key], [5], 1200)),
    );
    expect(attempts.filter((retry) => retry === 0)).toHaveLength(5);
    expect(attempts.filter((retry) => retry > 0)).toHaveLength(5);

    const app = buildApp({
      checkDatabase: async () => true,
      auth: {
        register: vi.fn(),
        findUser: vi.fn(async () => null),
        createSession: vi.fn(),
        findSession: vi.fn(),
        deleteSession: vi.fn(),
        deleteExpiredSessions: vi.fn(),
      },
      authRateLimiter: createAuthRateLimiter(redis.store),
    });
    try {
      for (let i = 0; i < 10; i++) {
        const response = await app.inject({
          method: 'POST',
          url: '/auth/login',
          remoteAddress: `192.0.2.${i + 1}`,
          payload: {
            email: 'reader@example.com',
            password: 'incorrect password',
          },
        });
        expect(response.statusCode).toBe(401);
      }
      const blocked = await app.inject({
        method: 'POST',
        url: '/auth/login',
        remoteAddress: '192.0.2.20',
        payload: {
          email: 'READER@example.com',
          password: 'incorrect password',
        },
      });
      expect(blocked.statusCode).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

      for (let i = 0; i < 3; i++) {
        const response = await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: {
            email: i % 2 ? 'NEW@example.com' : 'new@example.com',
            password: 'correct horse battery staple',
          },
        });
        expect(response.statusCode).toBe(409);
      }
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/auth/register',
            payload: {
              email: 'new@example.com',
              password: 'correct horse battery staple',
            },
          })
        ).statusCode,
      ).toBe(429);

      await new Promise((resolve) => setTimeout(resolve, 1300));
      expect(await redis.store.consume([key], [5], 1200)).toBe(0);

      await container.stop();
      stopped = true;
      const unavailable = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'other@example.com', password: 'incorrect password' },
      });
      expect(unavailable.statusCode).toBe(503);
      expect(unavailable.body).not.toContain(container.getConnectionUrl());
    } finally {
      await app.close();
    }
  } finally {
    redis.close();
    if (!stopped) await container.stop();
  }
}, 60_000);
