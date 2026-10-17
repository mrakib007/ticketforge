import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

let app: FastifyInstance;
afterEach(async () => {
  if (app) await app.close();
});

describe('health endpoints', () => {
  it('reports liveness independently of the database', async () => {
    app = buildApp({ checkDatabase: async () => false });
    const response = await app.inject('/health/live');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('reports readiness after a successful database check', async () => {
    app = buildApp({ checkDatabase: async () => true });
    const response = await app.inject('/health/ready');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('returns 503 when the database is unavailable', async () => {
    app = buildApp({ checkDatabase: async () => false });
    const response = await app.inject('/health/ready');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
  });

  it('does not leak a database error in readiness', async () => {
    app = buildApp({
      checkDatabase: async () => {
        throw new Error('secret password');
      },
    });
    const response = await app.inject('/health/ready');
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('secret password');
  });
});
