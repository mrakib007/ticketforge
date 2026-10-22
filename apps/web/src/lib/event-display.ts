import type { PublicEvent } from '@ticketforge/contracts';

const format = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'UTC',
});

export function eventSchedule(
  event: Pick<PublicEvent, 'startsAt' | 'endsAt'>,
): string {
  return `${format.format(new Date(event.startsAt))} – ${format.format(new Date(event.endsAt))} UTC`;
}

export function eventDate(startsAt: string): {
  day: string;
  month: string;
  weekday: string;
} {
  const date = new Date(startsAt);
  return {
    day: new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      timeZone: 'UTC',
    }).format(date),
    month: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
      .format(date)
      .toUpperCase(),
    weekday: new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(date),
  };
}

export function eventHours(
  event: Pick<PublicEvent, 'startsAt' | 'endsAt'>,
): string {
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  const endDate =
    event.startsAt.slice(0, 10) === event.endsAt.slice(0, 10)
      ? ''
      : `${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(event.endsAt))}, `;
  return `${time.format(new Date(event.startsAt))} – ${endDate}${time.format(new Date(event.endsAt))} UTC`;
}
