import type { OrganizerEvent } from '@ticketforge/contracts';

export type EventFields = Pick<
  OrganizerEvent,
  'title' | 'description' | 'venue' | 'startsAt' | 'endsAt' | 'capacity'
>;
type Failure = {
  status:
    | 'unauthorized'
    | 'forbidden'
    | 'not-found'
    | 'invalid'
    | 'conflict'
    | 'unavailable';
};
type Result<T> = { status: 'ok'; value: T } | Failure;
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const tokenPattern = /^[a-f\d]{64}$/;

function isEvent(value: unknown): value is OrganizerEvent {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    uuid.test(row.id) &&
    ['title', 'description', 'venue'].every(
      (field) => typeof row[field] === 'string',
    ) &&
    typeof row.startsAt === 'string' &&
    !Number.isNaN(Date.parse(row.startsAt)) &&
    typeof row.endsAt === 'string' &&
    Date.parse(row.endsAt) > Date.parse(row.startsAt) &&
    Number.isInteger(row.capacity) &&
    (row.capacity as number) >= 0 &&
    Number.isInteger(row.bookedSeats) &&
    (row.bookedSeats as number) >= 0 &&
    (row.bookedSeats as number) <= (row.capacity as number) &&
    row.remainingSeats ===
      (row.capacity as number) - (row.bookedSeats as number) &&
    typeof row.published === 'boolean' &&
    Number.isInteger(row.activeBookings) &&
    (row.activeBookings as number) >= 0 &&
    Number.isInteger(row.cancelledBookings) &&
    (row.cancelledBookings as number) >= 0
  );
}
function apiUrl(path: string): URL {
  return new URL(path, process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001');
}
async function request(
  token: string,
  path: string,
  method = 'GET',
  body?: object,
): Promise<Result<unknown>> {
  if (!tokenPattern.test(token)) return { status: 'unauthorized' };
  try {
    const response = await fetch(apiUrl(path), {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401) return { status: 'unauthorized' };
    if (response.status === 403) return { status: 'forbidden' };
    if (response.status === 404) return { status: 'not-found' };
    if (response.status === 400) return { status: 'invalid' };
    if (response.status === 409) return { status: 'conflict' };
    if (!response.ok) return { status: 'unavailable' };
    return { status: 'ok', value: (await response.json()) as unknown };
  } catch {
    return { status: 'unavailable' };
  }
}
export async function listOrganizerEvents(
  token: string,
): Promise<{ status: 'ok'; events: OrganizerEvent[] } | Failure> {
  const result = await request(token, '/organizer/events');
  if (result.status !== 'ok') return result;
  const value = result.value;
  if (
    !value ||
    typeof value !== 'object' ||
    !('events' in value) ||
    !Array.isArray(value.events) ||
    !value.events.every(isEvent)
  )
    return { status: 'unavailable' };
  return { status: 'ok', events: value.events };
}
export async function getOrganizerEvent(
  token: string,
  id: string,
): Promise<Result<OrganizerEvent>> {
  if (!uuid.test(id)) return { status: 'not-found' };
  const result = await request(token, `/organizer/events/${id}`);
  return result.status === 'ok'
    ? isEvent(result.value)
      ? (result as Result<OrganizerEvent>)
      : { status: 'unavailable' }
    : result;
}
export async function saveOrganizerEvent(
  token: string,
  input: Partial<EventFields>,
  id?: string,
): Promise<Result<OrganizerEvent>> {
  if (id && !uuid.test(id)) return { status: 'not-found' };
  if (
    (!id && Object.keys(input).length !== 6) ||
    Object.keys(input).length === 0 ||
    (input.title !== undefined && !input.title.trim()) ||
    (input.description !== undefined && !input.description.trim()) ||
    (input.venue !== undefined && !input.venue.trim()) ||
    (input.capacity !== undefined &&
      (!Number.isInteger(input.capacity) ||
        input.capacity < 0 ||
        input.capacity > 1000000)) ||
    (input.startsAt !== undefined &&
      (!input.startsAt.endsWith('Z') ||
        Number.isNaN(Date.parse(input.startsAt)))) ||
    (input.endsAt !== undefined &&
      (!input.endsAt.endsWith('Z') ||
        Number.isNaN(Date.parse(input.endsAt)))) ||
    (input.startsAt &&
      input.endsAt &&
      Date.parse(input.endsAt) <= Date.parse(input.startsAt))
  )
    return { status: 'invalid' };
  const result = await request(
    token,
    id ? `/organizer/events/${id}` : '/organizer/events',
    id ? 'PATCH' : 'POST',
    input,
  );
  return result.status === 'ok'
    ? isEvent(result.value)
      ? (result as Result<OrganizerEvent>)
      : { status: 'unavailable' }
    : result;
}
export async function setEventPublication(
  token: string,
  id: string,
  publish: boolean,
): Promise<Result<OrganizerEvent>> {
  if (!uuid.test(id)) return { status: 'not-found' };
  const result = await request(
    token,
    `/organizer/events/${id}/${publish ? 'publish' : 'unpublish'}`,
    'POST',
  );
  return result.status === 'ok'
    ? isEvent(result.value)
      ? (result as Result<OrganizerEvent>)
      : { status: 'unavailable' }
    : result;
}
