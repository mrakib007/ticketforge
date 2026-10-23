import type {
  PublicCinemaBookingReceipt,
  PublicCinemaHold,
} from '@ticketforge/contracts';

const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const keyPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;

function validHold(value: unknown): value is PublicCinemaHold {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    uuid.test(row.id) &&
    typeof row.screeningId === 'string' &&
    uuid.test(row.screeningId) &&
    Array.isArray(row.seatIds) &&
    row.seatIds.length >= 1 &&
    row.seatIds.length <= 10 &&
    row.seatIds.every(
      (id: unknown) => typeof id === 'string' && uuid.test(id),
    ) &&
    new Set(row.seatIds).size === row.seatIds.length &&
    [
      'HOLDING',
      'EXPIRED',
      'PAYMENT_FAILED',
      'CONFIRMED',
      'PAID_UNFULFILLED',
    ].includes(row.status as string) &&
    typeof row.expiresAt === 'string' &&
    !Number.isNaN(Date.parse(row.expiresAt)) &&
    Number.isSafeInteger(row.totalMinor) &&
    (row.totalMinor as number) >= 0 &&
    row.currency === 'USD'
  );
}

type HoldResult =
  | { status: 'ok'; hold: PublicCinemaHold }
  | {
      status:
        | 'invalid'
        | 'unauthorized'
        | 'not-found'
        | 'taken'
        | 'limit'
        | 'conflict'
        | 'unavailable';
    };

export async function holdCinemaSeats(
  token: string,
  cinemaId: string,
  screeningId: string,
  seatIds: string[],
  key: string,
): Promise<HoldResult> {
  if (!/^[a-f0-9]{64}$/.test(token)) return { status: 'unauthorized' };
  if (
    ![cinemaId, screeningId, ...seatIds].every((id) => uuid.test(id)) ||
    !keyPattern.test(key) ||
    seatIds.length < 1 ||
    seatIds.length > 10 ||
    new Set(seatIds).size !== seatIds.length
  )
    return { status: 'invalid' };
  try {
    const response = await fetch(
      new URL(
        `/cinemas/${cinemaId}/screenings/${screeningId}/holds`,
        process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001',
      ),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        body: JSON.stringify({ seatIds }),
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      },
    );
    if (response.status === 401) return { status: 'unauthorized' };
    if (response.status === 404) return { status: 'not-found' };
    if (response.status === 400) return { status: 'invalid' };
    if (response.status === 409) {
      const body: unknown = await response.json();
      if (body && typeof body === 'object' && 'error' in body) {
        if (body.error === 'Maximum 10 tickets per person for this screening')
          return { status: 'limit' };
        if (body.error === 'Idempotency key used for another hold')
          return { status: 'conflict' };
      }
      return { status: 'taken' };
    }
    if (response.status !== 200 && response.status !== 201)
      return { status: 'unavailable' };
    const hold: unknown = await response.json();
    return validHold(hold) &&
      hold.screeningId === screeningId &&
      hold.seatIds.length === seatIds.length &&
      hold.seatIds.every((id) => seatIds.includes(id))
      ? { status: 'ok', hold }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function fetchCinemaHold(
  token: string,
  id: string,
): Promise<HoldResult> {
  if (!/^[a-f0-9]{64}$/.test(token)) return { status: 'unauthorized' };
  if (!uuid.test(id)) return { status: 'invalid' };
  try {
    const response = await fetch(
      new URL(
        `/cinema-holds/${id}`,
        process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001',
      ),
      {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      },
    );
    if (response.status === 401) return { status: 'unauthorized' };
    if (response.status === 404) return { status: 'not-found' };
    if (!response.ok) return { status: 'unavailable' };
    const hold: unknown = await response.json();
    return validHold(hold) && hold.id === id
      ? { status: 'ok', hold }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function fetchCinemaBookings(
  token: string,
): Promise<
  | { status: 'ok'; bookings: PublicCinemaBookingReceipt[] }
  | { status: 'unauthorized' | 'unavailable' }
> {
  if (!/^[a-f0-9]{64}$/.test(token)) return { status: 'unauthorized' };
  try {
    const response = await fetch(
      new URL(
        '/cinema-bookings',
        process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001',
      ),
      {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(3000),
      },
    );
    if (response.status === 401) return { status: 'unauthorized' };
    if (!response.ok) return { status: 'unavailable' };
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('bookings' in body))
      return { status: 'unavailable' };
    const rows = (body as { bookings: unknown }).bookings;
    if (
      !Array.isArray(rows) ||
      rows.length > 100 ||
      !rows.every((value: unknown) => {
        if (!value || typeof value !== 'object') return false;
        const row = value as Record<string, unknown>;
        return (
          typeof row.id === 'string' &&
          uuid.test(row.id) &&
          typeof row.screeningId === 'string' &&
          uuid.test(row.screeningId) &&
          typeof row.cinemaId === 'string' &&
          uuid.test(row.cinemaId) &&
          typeof row.cinemaName === 'string' &&
          typeof row.movieTitle === 'string' &&
          typeof row.startsAt === 'string' &&
          !Number.isNaN(Date.parse(row.startsAt)) &&
          typeof row.createdAt === 'string' &&
          !Number.isNaN(Date.parse(row.createdAt)) &&
          Array.isArray(row.seatIds) &&
          row.seatIds.length >= 1 &&
          row.seatIds.length <= 10 &&
          row.seatIds.every(
            (id: unknown) => typeof id === 'string' && uuid.test(id),
          ) &&
          Array.isArray(row.seats) &&
          row.seats.length === row.seatIds.length &&
          row.seats.every(
            (seat: unknown) =>
              seat !== null &&
              typeof seat === 'object' &&
              typeof (seat as Record<string, unknown>).rowLabel === 'string' &&
              Number.isInteger((seat as Record<string, unknown>).seatNumber),
          )
        );
      })
    )
      return { status: 'unavailable' };
    return { status: 'ok', bookings: rows as PublicCinemaBookingReceipt[] };
  } catch {
    return { status: 'unavailable' };
  }
}
