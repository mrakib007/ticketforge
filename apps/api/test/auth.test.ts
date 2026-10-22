import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { AuthRepository } from '../src/modules/auth/repository.js';

const user = {
  id: '4cbaea02-4660-4f11-9e3f-207d5fe34609',
  email: 'reader@example.com',
  role: 'ATTENDEE' as const,
};
const accounts = new Map<
  string,
  { id: string; email: string; role: 'ATTENDEE'; passwordHash: string }
>();
const sessions = new Map<string, { userId: string; expiresAt: Date }>();
const repository: AuthRepository = {
  register: vi.fn(async (email, passwordHash, tokenHash, expiresAt) => {
    if (accounts.has(email)) return null;
    accounts.set(email, { ...user, email, passwordHash });
    sessions.set(tokenHash, { userId: user.id, expiresAt });
    return { ...user, email };
  }),
  findUser: vi.fn(async (email) => accounts.get(email) ?? null),
  createSession: vi.fn(async (userId, tokenHash, expiresAt) => {
    sessions.set(tokenHash, { userId, expiresAt });
  }),
  findSession: vi.fn(async (tokenHash) => {
    const session = sessions.get(tokenHash);
    return session && session.expiresAt > new Date() ? user : null;
  }),
  deleteSession: vi.fn(async (tokenHash) => {
    sessions.delete(tokenHash);
  }),
  deleteExpiredSessions: vi.fn(async (cutoff) => {
    let deleted = 0;
    for (const [tokenHash, session] of sessions) {
      if (session.expiresAt <= cutoff) {
        sessions.delete(tokenHash);
        deleted++;
      }
    }
    return deleted;
  }),
};
let app: FastifyInstance;
const request = async (
  url: string,
  method: 'POST' | 'GET',
  payload?: object,
  token?: string,
) =>
  await app.inject({
    url,
    method,
    payload,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

afterEach(async () => {
  if (app) await app.close();
  accounts.clear();
  sessions.clear();
  vi.clearAllMocks();
});

describe('authentication', () => {
  it('registers, authenticates, identifies and logs out a user', async () => {
    app = buildApp({ checkDatabase: async () => true, auth: repository });
    const registered = await request('/auth/register', 'POST', {
      email: 'Reader@Example.com',
      password: 'correct horse battery staple',
    });
    expect(registered.statusCode).toBe(201);
    expect(registered.json().user).toEqual(user);
    expect(registered.json().token).toMatch(/^[a-f0-9]{64}$/);
    expect(registered.body).not.toContain('correct horse');
    expect(accounts.get(user.email)?.passwordHash).not.toContain(
      'correct horse',
    );
    const token = registered.json().token as string;
    expect((await request('/auth/me', 'GET', undefined, token)).json()).toEqual(
      { user },
    );
    const login = await request('/auth/login', 'POST', {
      email: user.email,
      password: 'correct horse battery staple',
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().token).not.toBe(token);
    expect(
      (await request('/auth/logout', 'POST', undefined, token)).statusCode,
    ).toBe(204);
    expect(
      (await request('/auth/me', 'GET', undefined, token)).statusCode,
    ).toBe(401);
    expect(
      (await request('/auth/me', 'GET', undefined, login.json().token))
        .statusCode,
    ).toBe(200);
  });

  it('rejects bad input, duplicates and incorrect credentials', async () => {
    app = buildApp({ checkDatabase: async () => true, auth: repository });
    for (const payload of [
      { email: 'bad', password: 'long enough password' },
      { email: user.email, password: 'short' },
      { email: user.email, password: 123 },
    ]) {
      expect(
        (await request('/auth/register', 'POST', payload)).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await request('/auth/register', 'POST', {
          email: user.email,
          password: 'correct horse battery staple',
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await request('/auth/register', 'POST', {
          email: 'READER@example.com',
          password: 'correct horse battery staple',
        })
      ).statusCode,
    ).toBe(409);
    for (const email of [user.email, 'missing@example.com']) {
      const response = await request('/auth/login', 'POST', {
        email,
        password: 'wrong password',
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Invalid credentials' });
    }
    expect((await request('/auth/me', 'GET')).statusCode).toBe(401);
    expect(
      (await request('/auth/me', 'GET', undefined, 'invalid')).statusCode,
    ).toBe(401);
    expect((await request('/auth/logout', 'POST')).statusCode).toBe(401);
  });

  it('does not expose database errors', async () => {
    app = buildApp({
      checkDatabase: async () => true,
      auth: {
        ...repository,
        findUser: async () => {
          throw new Error('private_password');
        },
      },
    });
    const response = await request('/auth/login', 'POST', {
      email: user.email,
      password: 'correct horse battery staple',
    });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('private_password');
  });
});
