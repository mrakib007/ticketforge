import { afterEach, expect, it, vi } from 'vitest';
import { fetchApiHealth } from '../src/lib/api-health';

afterEach(() => vi.unstubAllGlobals());

it('reports a healthy backend when readiness succeeds', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) }),
  );
  expect(await fetchApiHealth()).toBe('ok');
});

it('reports unavailable if the API cannot be reached', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('connection refused')),
  );
  expect(await fetchApiHealth()).toBe('unavailable');
});

it('reports unavailable on a non-healthy response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ status: 'unavailable' }),
    }),
  );
  expect(await fetchApiHealth()).toBe('unavailable');
});
