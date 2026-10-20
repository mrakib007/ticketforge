import { afterEach, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { createAuthRateLimiter } from '../src/modules/auth/rate-limit.js';

const counters = new Map<string, { count: number; expires: number }>();
let now = 0;
const store = {
  async consume(keys: string[], limits: number[], windowMs: number) {
    let retryAfter = 0;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const existing = counters.get(key);
      const counter =
        existing && existing.expires > now
          ? existing
          : { count: 0, expires: now + windowMs };
      counter.count++;
      counters.set(key, counter);
      if (counter.count > limits[i]!) {
        retryAfter = Math.max(
          retryAfter,
          Math.ceil((counter.expires - now) / 1000),
        );
      }
    }
    return retryAfter;
  },
};

afterEach(() => {
  counters.clear();
  now = 0;
});

it('limits login by normalized account across IPs, then permits it after expiry', async () => {
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
    authRateLimiter: createAuthRateLimiter(store),
  });
  try {
    for (let i = 0; i < 10; i++) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        remoteAddress: `192.0.2.${i + 1}`,
        payload: {
          email: i % 2 ? 'TEST@example.com' : 'test@example.com',
          password: 'wrong password',
        },
      });
      expect(response.statusCode).toBe(401);
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/auth/login',
      remoteAddress: '192.0.2.20',
      payload: { email: 'test@example.com', password: 'wrong password' },
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBe('900');
    expect(blocked.json()).toEqual({
      error: 'Too many attempts. Try again later.',
    });
    now += 900_001;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          remoteAddress: '192.0.2.20',
          payload: { email: 'test@example.com', password: 'wrong password' },
        })
      ).statusCode,
    ).toBe(401);
  } finally {
    await app.close();
  }
});

it('limits registration by IP before hashing, and fails closed when Redis is down', async () => {
  const register = vi.fn();
  const app = buildApp({
    checkDatabase: async () => true,
    auth: {
      register,
      findUser: vi.fn(),
      createSession: vi.fn(),
      findSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteExpiredSessions: vi.fn(),
    },
    authRateLimiter: createAuthRateLimiter(store),
  });
  try {
    for (let i = 0; i < 60; i++) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/auth/register',
            remoteAddress: '192.0.2.1',
            headers: { 'x-forwarded-for': `192.0.2.${i + 2}` },
            payload: {
              email: `person${i}@example.com`,
              password: 'long enough password',
            },
          })
        ).statusCode,
      ).not.toBe(429);
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/auth/register',
      remoteAddress: '192.0.2.1',
      payload: { email: 'other@example.com', password: 'long enough password' },
    });
    expect(blocked.statusCode).toBe(429);
    expect(register).toHaveBeenCalledTimes(60);
  } finally {
    await app.close();
  }

  const unavailable = buildApp({
    checkDatabase: async () => true,
    auth: {
      register,
      findUser: vi.fn(),
      createSession: vi.fn(),
      findSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteExpiredSessions: vi.fn(),
    },
    authRateLimiter: createAuthRateLimiter({
      consume: async () => {
        throw new Error('secret Redis URL');
      },
    }),
  });
  try {
    const response = await unavailable.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'new@example.com', password: 'long enough password' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('secret Redis URL');
    expect(register).toHaveBeenCalledTimes(60);
  } finally {
    await unavailable.close();
  }
});
