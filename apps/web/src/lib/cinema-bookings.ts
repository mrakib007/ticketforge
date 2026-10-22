import type {
  PublicCinemaBooking,
  PublicCinemaBookingReceipt,
} from '@ticketforge/contracts';

const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export async function reserveCinemaSeats(
  token: string,
  cinemaId: string,
  screeningId: string,
  seatIds: string[],
  key: string,
): Promise<
  | { status: 'ok'; booking: PublicCinemaBooking }
  | {
      status:
        | 'invalid'
        | 'unauthorized'
        | 'not-found'
        | 'taken'
        | 'limit'
        | 'conflict'
        | 'unavailable';
    }
> {
  if (!/^[a-f0-9]{64}$/.test(token)) return { status: 'unauthorized' };
  if (
    ![cinemaId, screeningId, key, ...seatIds].every((id) => uuid.test(id)) ||
    seatIds.length < 1 ||
    seatIds.length > 10 ||
    new Set(seatIds).size !== seatIds.length
  )
    return { status: 'invalid' };
  try {
    const response = await fetch(
      new URL(
        `/cinemas/${cinemaId}/screenings/${screeningId}/bookings`,
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
        if (body.error === 'Idempotency key used for another booking')
          return { status: 'conflict' };
      }
      return { status: 'taken' };
    }
    if (response.status !== 200 && response.status !== 201)
      return { status: 'unavailable' };
    const booking: unknown = await response.json();
    if (!booking || typeof booking !== 'object')
      return { status: 'unavailable' };
    const row = booking as Record<string, unknown>;
    return typeof row.id === 'string' &&
      uuid.test(row.id) &&
      row.screeningId === screeningId &&
      typeof row.createdAt === 'string' &&
      !Number.isNaN(Date.parse(row.createdAt)) &&
      Array.isArray(row.seatIds) &&
      row.seatIds.length === seatIds.length &&
      row.seatIds.every(
        (id: unknown) =>
          typeof id === 'string' && uuid.test(id) && seatIds.includes(id),
      )
      ? { status: 'ok', booking: booking as PublicCinemaBooking }
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
