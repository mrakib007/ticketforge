import { afterEach, expect, it, vi } from 'vitest';
import { authenticate, currentUser, revokeSession } from '../src/lib/auth-api';

afterEach(() => vi.unstubAllGlobals());

it('uses server-side API for registration and accepts only valid credentials', async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      user: { id: 'abc', email: 'reader@example.com', role: 'ATTENDEE' },
      token: 'a'.repeat(64),
    }),
  });
  vi.stubGlobal('fetch', fetch);
  expect(
    await authenticate('register', 'reader@example.com', 'long password'),
  ).toEqual({
    status: 'ok',
    user: { id: 'abc', email: 'reader@example.com', role: 'ATTENDEE' },
    token: 'a'.repeat(64),
  });
  expect(fetch).toHaveBeenCalledWith(
    expect.any(URL),
    expect.objectContaining({ method: 'POST', cache: 'no-store' }),
  );
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
    email: 'reader@example.com',
    password: 'long password',
  });
});

it('does not accept forged or invalid API responses', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 'abc' }, token: 'oops' }),
    }),
  );
  expect(
    (await authenticate('login', 'reader@example.com', 'long password')).status,
  ).toBe('unavailable');
});

it('handles denied credentials and offline API without leaking details', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
  expect(
    await authenticate('login', 'reader@example.com', 'wrong password'),
  ).toEqual({ status: 'invalid' });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('private_password')),
  );
  expect(
    await authenticate('login', 'reader@example.com', 'long password'),
  ).toEqual({ status: 'unavailable' });
  expect(await currentUser('a'.repeat(64))).toBeNull();
  await expect(revokeSession('a'.repeat(64))).resolves.toBeUndefined();
});

it('reports auth throttling separately from an offline API', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
  expect(
    await authenticate('login', 'reader@example.com', 'long password'),
  ).toEqual({ status: 'limited' });
});
