import { hashPassword } from '../modules/auth/password.js';

export const demoPassword = 'DemoPassword2026!';

interface SeedUserDatabase {
  user: {
    createMany(args: {
      data: { email: string; passwordHash: string; role?: 'ORGANIZER' }[];
      skipDuplicates: true;
    }): Promise<{ count: number }>;
  };
}

export function isLocalDemoSeed(
  databaseUrl: string,
  nodeEnv: string | undefined,
): boolean {
  if (nodeEnv === 'production') return false;
  try {
    const url = new URL(databaseUrl);
    return (
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export async function seedDemoUsers(
  database: SeedUserDatabase,
  databaseUrl: string,
  nodeEnv: string | undefined,
): Promise<number> {
  if (!isLocalDemoSeed(databaseUrl, nodeEnv))
    throw new Error(
      'Demo users may only be seeded into a local database outside production',
    );
  const emails = ['demo.alice@example.com', 'demo.bob@example.com'];
  const result = await database.user.createMany({
    data: await Promise.all(
      emails.map(async (email) => ({
        email,
        passwordHash: await hashPassword(demoPassword),
      })),
    ),
    skipDuplicates: true,
  });
  return result.count;
}

export async function seedDemoOrganizer(
  database: SeedUserDatabase,
  databaseUrl: string,
  nodeEnv: string | undefined,
): Promise<number> {
  if (!isLocalDemoSeed(databaseUrl, nodeEnv))
    throw new Error(
      'Demo organizer may only be seeded into a local database outside production',
    );
  const result = await database.user.createMany({
    data: [
      {
        email: 'demo.organizer@example.com',
        passwordHash: await hashPassword(demoPassword),
        role: 'ORGANIZER',
      },
    ],
    skipDuplicates: true,
  });
  return result.count;
}
