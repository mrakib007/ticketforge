import type { PublicEvent } from '@ticketforge/contracts';

const format = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'UTC',
});

export function eventSchedule(event: PublicEvent): string {
  return `${format.format(new Date(event.startsAt))} – ${format.format(new Date(event.endsAt))} UTC`;
}
