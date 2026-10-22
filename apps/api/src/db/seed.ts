import { loadConfig } from '../config.js';
import { createDatabase } from './client.js';
import { seedEvents } from './seed-events.js';
import { seedCinema } from './seed-cinema.js';
import {
  isLocalDemoSeed,
  seedDemoOrganizer,
  seedDemoUsers,
} from './seed-users.js';

const config = loadConfig(process.env);
const database = createDatabase(config);

try {
  await seedEvents(database);
  if (isLocalDemoSeed(config.databaseUrl, process.env.NODE_ENV)) {
    await seedCinema(database);
    console.log('Seeded fictional demo cinema and upcoming screenings');
    console.log(
      `Created ${await seedDemoUsers(database, config.databaseUrl, process.env.NODE_ENV)} demo users`,
    );
    console.log(
      `Created ${await seedDemoOrganizer(database, config.databaseUrl, process.env.NODE_ENV)} demo organizer`,
    );
  } else {
    console.log(
      'Skipped demo users: requires a local database outside production',
    );
  }
} catch (error) {
  console.error('Seed failed', error);
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
