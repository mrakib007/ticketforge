import type { PrismaClient } from '../generated/prisma/client.js';

export async function seedEvents(database: PrismaClient): Promise<number> {
  const result = await database.event.createMany({
    data: [
      {
        id: '8dd0b3a5-7371-46a0-82be-1ee52a9dc8b5',
        title: 'Night at the Observatory',
        description: 'Explore the night sky with local astronomers.',
        venue: 'City Observatory',
        startsAt: new Date('2028-07-12T19:00:00Z'),
        endsAt: new Date('2028-07-12T22:00:00Z'),
        published: true,
        capacity: 100,
      },
      {
        id: '870b5d13-978e-4557-8905-b59c3dfd9a95',
        title: 'Sound & Light Festival',
        description: 'An evening of live music and immersive art.',
        venue: 'Riverside Park',
        startsAt: new Date('2028-08-24T17:00:00Z'),
        endsAt: new Date('2028-08-24T23:00:00Z'),
        published: true,
        capacity: 100,
      },
    ],
    skipDuplicates: true,
  });
  // Existing sample rows predate capacity; give them inventory without
  // changing events whose capacity was configured separately.
  await database.event.updateMany({
    where: {
      id: {
        in: [
          '8dd0b3a5-7371-46a0-82be-1ee52a9dc8b5',
          '870b5d13-978e-4557-8905-b59c3dfd9a95',
        ],
      },
      capacity: 0,
    },
    data: { capacity: 100 },
  });
  console.log(`Created ${result.count} sample events`);
  return result.count;
}
