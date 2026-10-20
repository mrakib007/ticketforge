import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { checkDatabase, createDatabase } from './db/client.js';
import { createEventReader } from './modules/events/repository.js';
import { createAuthRepository } from './modules/auth/repository.js';
import { startSessionCleanup } from './modules/auth/session-cleanup.js';
import { createAuthRateLimiter } from './modules/auth/rate-limit.js';
import { createRedisRateLimitStore } from './modules/auth/redis-rate-limit.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const redis = createRedisRateLimitStore(config.redisUrl);
  const database = createDatabase(config, () =>
    app.log.error('PostgreSQL connection error'),
  );
  const auth = createAuthRepository(database);
  const app = buildApp({
    checkDatabase: () => checkDatabase(database),
    events: createEventReader(database),
    auth,
    authRateLimiter: createAuthRateLimiter(redis.store),
  });
  const stopSessionCleanup = startSessionCleanup(auth, app.log);
  void redis
    .connect()
    .catch(() =>
      app.log.error(
        'Redis connection unavailable; auth requests will be rejected',
      ),
    );

  let shuttingDown = false;
  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      try {
        await stopSessionCleanup();
      } finally {
        try {
          await app.close();
        } finally {
          try {
            await database.$disconnect();
          } finally {
            redis.close();
          }
        }
      }
    } catch (error) {
      app.log.error({ err: error }, 'Shutdown failed');
      process.exitCode = 1;
    }
  }
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error({ err: error }, 'API startup failed');
    process.exitCode = 1;
    await shutdown();
  }
}

void main().catch((error: unknown) => {
  console.error('API configuration failed', error);
  process.exitCode = 1;
});
