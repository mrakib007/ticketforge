import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const envFile = fileURLToPath(new URL('.env', import.meta.url));
if (existsSync(envFile)) loadEnvFile(envFile);

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const url = connectionString ? new URL(connectionString) : undefined;
if (url && process.env.DB_SSL === 'true') {
  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('sslaccept', 'strict');
} else if (url && process.env.DB_SSL === 'false') {
  url.searchParams.set('sslmode', 'disable');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Generation works without a database URL; database commands require one.
  datasource: { url: url?.toString() ?? '' },
});
