import { expect, it } from 'vitest';
import { metadata } from '../src/app/layout';

it('describes the attendee-facing product rather than engineering internals', () => {
  expect(metadata.title).toBe('TicketForge | Find your next good night');
  expect(metadata.description).toContain('free event bookings');
});
