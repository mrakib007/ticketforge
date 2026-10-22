import type {
  PublicCinema,
  PublicScreening,
  PublicScreeningDetail,
} from '@ticketforge/contracts';

type Result<T> =
  | { status: 'ok'; value: T }
  | { status: 'not-found' | 'unavailable' };
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
function validZone(zone: unknown): zone is string {
  if (typeof zone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function cinema(value: unknown): value is PublicCinema {
  if (!record(value)) return false;
  return (
    typeof value.id === 'string' &&
    uuid.test(value.id) &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.address === 'string' &&
    validZone(value.timeZone) &&
    (value.imageUrl === null || typeof value.imageUrl === 'string') &&
    typeof value.isDemo === 'boolean'
  );
}
function screening(value: unknown): value is PublicScreening {
  if (!record(value) || !record(value.movie) || !record(value.auditorium))
    return false;
  const movie = value.movie;
  const auditorium = value.auditorium;
  return (
    typeof value.id === 'string' &&
    uuid.test(value.id) &&
    typeof auditorium.id === 'string' &&
    uuid.test(auditorium.id) &&
    typeof auditorium.name === 'string' &&
    typeof movie.id === 'string' &&
    uuid.test(movie.id) &&
    typeof movie.title === 'string' &&
    typeof movie.synopsis === 'string' &&
    Number.isInteger(movie.durationMinutes) &&
    (movie.durationMinutes as number) > 0 &&
    (movie.posterUrl === null || typeof movie.posterUrl === 'string') &&
    (movie.releaseDate === null ||
      (typeof movie.releaseDate === 'string' &&
        /^\d{4}-\d\d-\d\d$/.test(movie.releaseDate))) &&
    typeof value.startsAt === 'string' &&
    typeof value.endsAt === 'string' &&
    typeof value.bookingClosesAt === 'string' &&
    !Number.isNaN(Date.parse(value.startsAt)) &&
    Date.parse(value.endsAt) > Date.parse(value.startsAt) &&
    !Number.isNaN(Date.parse(value.bookingClosesAt)) &&
    Date.parse(value.bookingClosesAt) <= Date.parse(value.startsAt) &&
    Number.isInteger(value.priceMinor) &&
    (value.priceMinor as number) >= 0 &&
    typeof value.currency === 'string' &&
    /^[A-Z]{3}$/.test(value.currency)
  );
}
function screeningDetail(value: unknown): value is PublicScreeningDetail {
  return (
    screening(value) &&
    record(value) &&
    Array.isArray(value.seats) &&
    value.seats.length <= 500 &&
    value.seats.every(
      (seat: unknown) =>
        record(seat) &&
        typeof seat.id === 'string' &&
        uuid.test(seat.id) &&
        typeof seat.booked === 'boolean' &&
        typeof seat.rowLabel === 'string' &&
        typeof seat.seatNumber === 'number' &&
        Number.isInteger(seat.seatNumber) &&
        seat.seatNumber > 0 &&
        typeof seat.category === 'string',
    )
  );
}
async function request(path: string): Promise<Result<unknown>> {
  try {
    const response = await fetch(
      new URL(path, process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'),
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(3000),
      },
    );
    if (response.status === 404) return { status: 'not-found' };
    if (!response.ok) return { status: 'unavailable' };
    return { status: 'ok', value: (await response.json()) as unknown };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function fetchCinemas(): Promise<Result<PublicCinema[]>> {
  const result = await request('/cinemas');
  if (result.status !== 'ok') return result;
  const body = result.value;
  return record(body) &&
    Array.isArray(body.cinemas) &&
    body.cinemas.length <= 50 &&
    body.cinemas.every(cinema)
    ? { status: 'ok', value: body.cinemas }
    : { status: 'unavailable' };
}
export async function fetchCinema(id: string): Promise<Result<PublicCinema>> {
  if (!uuid.test(id)) return { status: 'not-found' };
  const result = await request(`/cinemas/${id}`);
  return result.status === 'ok'
    ? cinema(result.value) && result.value.id === id
      ? (result as Result<PublicCinema>)
      : { status: 'unavailable' }
    : result;
}
export async function fetchScreenings(
  id: string,
): Promise<Result<PublicScreening[]>> {
  if (!uuid.test(id)) return { status: 'not-found' };
  const result = await request(`/cinemas/${id}/screenings`);
  if (result.status !== 'ok') return result;
  const body = result.value;
  return record(body) &&
    Array.isArray(body.screenings) &&
    body.screenings.length <= 50 &&
    body.screenings.every(screening)
    ? { status: 'ok', value: body.screenings }
    : { status: 'unavailable' };
}
export async function fetchScreening(
  id: string,
  screeningId: string,
): Promise<Result<PublicScreeningDetail>> {
  if (!uuid.test(id) || !uuid.test(screeningId)) return { status: 'not-found' };
  const result = await request(`/cinemas/${id}/screenings/${screeningId}`);
  return result.status === 'ok'
    ? screeningDetail(result.value) && result.value.id === screeningId
      ? (result as Result<PublicScreeningDetail>)
      : { status: 'unavailable' }
    : result;
}

export function cinemaTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}
export function cinemaPrice(priceMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(
      priceMinor / 100,
    );
  } catch {
    return `${priceMinor} minor units (${currency})`;
  }
}
