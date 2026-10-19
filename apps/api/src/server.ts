import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { checkDatabase, createDatabase } from './db/client.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const database = createDatabase(config, () =>
    app.log.error('PostgreSQL connection error'),
  );
  const app = buildApp({ checkDatabase: () => checkDatabase(database) });

  let shuttingDown = false;
  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      try {
        await app.close();
      } finally {
        await database.$disconnect();
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
