import type {
  BookingListResponse,
  PublicBooking,
} from '@ticketforge/contracts';

const tokenPattern = /^[a-f0-9]{64}$/;
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

function isBooking(value: unknown): value is PublicBooking {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (!row.event || typeof row.event !== 'object') return false;
  const event = row.event as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    uuid.test(row.id) &&
    typeof row.eventId === 'string' &&
    uuid.test(row.eventId) &&
    Number.isInteger(row.quantity) &&
    (row.quantity as number) > 0 &&
    (row.quantity as number) <= 10 &&
    typeof row.createdAt === 'string' &&
    !Number.isNaN(Date.parse(row.createdAt)) &&
    (row.cancelledAt === null ||
      (typeof row.cancelledAt === 'string' &&
        !Number.isNaN(Date.parse(row.cancelledAt)))) &&
    typeof event.title === 'string' &&
    typeof event.venue === 'string' &&
    typeof event.startsAt === 'string' &&
    !Number.isNaN(Date.parse(event.startsAt)) &&
    typeof event.endsAt === 'string' &&
    Date.parse(event.endsAt) > Date.parse(event.startsAt)
  );
}

export async function cancelBooking(
  token: string,
  bookingId: string,
): Promise<{
  status:
    | 'ok'
    | 'invalid'
    | 'unauthorized'
    | 'not-found'
    | 'too-late'
    | 'unavailable';
}> {
  if (!tokenPattern.test(token)) return { status: 'unauthorized' };
  if (!uuid.test(bookingId)) return { status: 'invalid' };
  try {
    const response = await fetch(apiUrl(`/bookings/${bookingId}/cancel`), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 200) return { status: 'ok' };
    if (response.status === 401) return { status: 'unauthorized' };
    if (response.status === 404) return { status: 'not-found' };
    if (response.status === 409) return { status: 'too-late' };
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

function apiUrl(path: string): URL {
  return new URL(path, process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001');
}

export async function createBooking(
  token: string,
  eventId: string,
  quantity: number,
  idempotencyKey: string,
): Promise<
  | { status: 'ok'; booking: PublicBooking }
  | {
      status:
        | 'invalid'
        | 'unauthorized'
        | 'not-found'
        | 'sold-out'
        | 'conflict'
        | 'unavailable';
    }
> {
  if (!tokenPattern.test(token)) return { status: 'unauthorized' };
  if (
    !uuid.test(eventId) ||
    !uuid.test(idempotencyKey) ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10
  )
    return { status: 'invalid' };
  try {
    const response = await fetch(apiUrl('/bookings'), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({ eventId, quantity }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401) return { status: 'unauthorized' };
    if (response.status === 404) return { status: 'not-found' };
    if (response.status === 409) {
      const error: unknown = await response.json();
      return error &&
        typeof error === 'object' &&
        'error' in error &&
        error.error === 'Idempotency key used for another booking'
        ? { status: 'conflict' }
        : { status: 'sold-out' };
    }
    if (response.status === 400) return { status: 'invalid' };
    if (response.status !== 201 && response.status !== 200)
      return { status: 'unavailable' };
    const booking: unknown = await response.json();
    return isBooking(booking) &&
      booking.eventId === eventId &&
      booking.quantity === quantity
      ? { status: 'ok', booking }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function fetchBookings(
  token: string,
): Promise<
  | { status: 'ok'; bookings: PublicBooking[] }
  | { status: 'unauthorized' | 'unavailable' }
> {
  if (!tokenPattern.test(token)) return { status: 'unauthorized' };
  try {
    const response = await fetch(apiUrl('/bookings'), {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 401) return { status: 'unauthorized' };
    if (!response.ok) return { status: 'unavailable' };
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('bookings' in body))
      return { status: 'unavailable' };
    const bookings = (body as BookingListResponse).bookings;
    return Array.isArray(bookings) && bookings.every(isBooking)
      ? { status: 'ok', bookings }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
