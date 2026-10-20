import type { AuthRepository } from './repository.js';

const cleanupIntervalMs = 60 * 60 * 1000;

export function startSessionCleanup(
  repository: Pick<AuthRepository, 'deleteExpiredSessions'>,
  log: {
    info: (details: { deleted: number }, message: string) => void;
    error: (details: { err: unknown }, message: string) => void;
  },
  intervalMs = cleanupIntervalMs,
): () => Promise<void> {
  let stopped = false;
  let running: Promise<void> | undefined;

  function run(): void {
    if (stopped || running) return;
    running = (async () => {
      try {
        const deleted = await repository.deleteExpiredSessions(new Date());
        if (deleted > 0) log.info({ deleted }, 'Expired sessions removed');
      } catch (err) {
        log.error({ err }, 'Expired session cleanup failed');
      } finally {
        running = undefined;
      }
    })();
  }

  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();

  return async () => {
    stopped = true;
    clearInterval(timer);
    await running;
  };
}
