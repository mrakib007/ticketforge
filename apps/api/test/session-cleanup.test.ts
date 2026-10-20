import { afterEach, expect, it, vi } from 'vitest';
import { startSessionCleanup } from '../src/modules/auth/session-cleanup.js';

afterEach(() => {
  vi.useRealTimers();
});

it('runs at startup and on schedule with the current cutoff, then stops', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
  const deleteExpiredSessions = vi.fn().mockResolvedValue(2);
  const log = { info: vi.fn(), error: vi.fn() };

  const stop = startSessionCleanup({ deleteExpiredSessions }, log, 60_000);
  await vi.waitFor(() =>
    expect(deleteExpiredSessions).toHaveBeenCalledTimes(1),
  );
  expect(deleteExpiredSessions).toHaveBeenCalledWith(
    new Date('2026-10-20T00:00:00Z'),
  );

  await vi.advanceTimersByTimeAsync(60_000);
  expect(deleteExpiredSessions).toHaveBeenCalledTimes(2);
  expect(deleteExpiredSessions).toHaveBeenLastCalledWith(
    new Date('2026-10-20T00:01:00Z'),
  );
  await stop();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(deleteExpiredSessions).toHaveBeenCalledTimes(2);
});

it('logs failures and retries at the next interval without overlapping runs', async () => {
  vi.useFakeTimers();
  let rejectRun!: (error: Error) => void;
  const deleteExpiredSessions = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<number>((_resolve, reject) => {
          rejectRun = reject;
        }),
    )
    .mockResolvedValue(1);
  const log = { info: vi.fn(), error: vi.fn() };
  const stop = startSessionCleanup({ deleteExpiredSessions }, log, 60_000);

  await vi.advanceTimersByTimeAsync(60_000);
  expect(deleteExpiredSessions).toHaveBeenCalledTimes(1);
  rejectRun(new Error('database unavailable'));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(log.error).toHaveBeenCalledTimes(1);
  expect(deleteExpiredSessions).toHaveBeenCalledTimes(2);
  await stop();
});

it('waits for an in-flight cleanup before shutdown completes', async () => {
  vi.useFakeTimers();
  let finishRun!: (count: number) => void;
  const deleteExpiredSessions = vi.fn(
    () =>
      new Promise<number>((resolve) => {
        finishRun = resolve;
      }),
  );
  const stop = startSessionCleanup(
    { deleteExpiredSessions },
    { info: vi.fn(), error: vi.fn() },
    60_000,
  );
  let stopped = false;
  const shutdown = stop().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  expect(stopped).toBe(false);
  finishRun(1);
  await shutdown;
  expect(stopped).toBe(true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(deleteExpiredSessions).toHaveBeenCalledTimes(1);
});
