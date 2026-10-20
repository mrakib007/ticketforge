import type { PublicEvent } from '@ticketforge/contracts';

type EventListResult =
  | { status: 'ok'; events: PublicEvent[] }
  | { status: 'unavailable' };
type EventResult =
  | { status: 'ok'; event: PublicEvent }
  | { status: 'not-found' }
  | { status: 'unavailable' };

function isEvent(value: unknown): value is PublicEvent {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.description === 'string' &&
    typeof item.venue === 'string' &&
    typeof item.startsAt === 'string' &&
    !Number.isNaN(Date.parse(item.startsAt)) &&
    typeof item.endsAt === 'string' &&
    !Number.isNaN(Date.parse(item.endsAt)) &&
    Date.parse(item.endsAt) > Date.parse(item.startsAt)
  );
}

async function apiGet(path: string): Promise<Response> {
  const baseUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';
  return fetch(new URL(path, baseUrl), {
    cache: 'no-store',
    signal: AbortSignal.timeout(3000),
  });
}

export async function fetchEvents(): Promise<EventListResult> {
  try {
    const response = await apiGet('/events');
    if (!response.ok) return { status: 'unavailable' };
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== 'object' ||
      !('events' in body) ||
      !Array.isArray(body.events) ||
      !body.events.every(isEvent)
    ) {
      return { status: 'unavailable' };
    }
    return { status: 'ok', events: body.events };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function fetchEvent(id: string): Promise<EventResult> {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) {
    return { status: 'not-found' };
  }
  try {
    const response = await apiGet(`/events/${id}`);
    if (response.status === 404) return { status: 'not-found' };
    if (!response.ok) return { status: 'unavailable' };
    const body: unknown = await response.json();
    return isEvent(body) && body.id === id
      ? { status: 'ok', event: body }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
