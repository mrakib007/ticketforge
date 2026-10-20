import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { databaseOptions } from '../src/db/client.js';

const local = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
};

describe('database configuration', () => {
  it('rejects a missing database URL', () => {
    expect(() => loadConfig({})).toThrow('DATABASE_URL');
  });

  it('uses local PostgreSQL without TLS by default', () => {
    const options = databaseOptions(loadConfig(local));
    expect(options.ssl).toBe(false);
    expect(options.max).toBe(10);
    expect(options.connectionTimeoutMillis).toBe(2000);
    expect(options.query_timeout).toBe(2000);
  });

  it('verifies TLS for Supabase', () => {
    const options = databaseOptions(loadConfig({ ...local, DB_SSL: 'true' }));
    expect(options.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('rejects an invalid pool size', () => {
    expect(() => loadConfig({ ...local, DB_POOL_MAX: '0' })).toThrow(
      'DB_POOL_MAX',
    );
  });

  it('uses local Redis by default and rejects invalid Redis URLs', () => {
    expect(loadConfig(local).redisUrl).toBe('redis://127.0.0.1:6379');
    expect(() =>
      loadConfig({ ...local, REDIS_URL: 'https://example.com' }),
    ).toThrow('REDIS_URL');
  });
});
