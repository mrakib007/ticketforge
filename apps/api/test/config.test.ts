import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';

const local = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
};

describe('database configuration', () => {
  it('rejects a missing database URL', () => {
    expect(() => loadConfig({})).toThrow('DATABASE_URL');
  });

  it('uses local PostgreSQL without TLS by default', () => {
    const pool = createPool(loadConfig(local));
    expect(pool.options.ssl).toBe(false);
    expect(pool.options.max).toBe(10);
  });

  it('verifies TLS for Supabase', () => {
    const pool = createPool(loadConfig({ ...local, DB_SSL: 'true' }));
    expect(pool.options.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('rejects an invalid pool size', () => {
    expect(() => loadConfig({ ...local, DB_POOL_MAX: '0' })).toThrow(
      'DB_POOL_MAX',
    );
  });
});
