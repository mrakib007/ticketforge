import { expect, it } from 'vitest';
import { eventHours } from '../src/lib/event-display';

it('does not hide the end date of a multi-day event', () => {
  expect(
    eventHours({
      startsAt: '2028-07-12T22:00:00Z',
      endsAt: '2028-07-13T01:00:00Z',
    }),
  ).toContain('Jul 13');
});
