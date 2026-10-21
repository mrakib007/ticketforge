export interface BookingAttempt {
  eventId: string;
  quantity: number;
  key: string;
}

export type BookingStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function storageKey(eventId: string): string {
  return `ticketforge_booking:${eventId}`;
}

export function readBookingAttempt(
  storage: BookingStorage | null,
  eventId: string,
): BookingAttempt | null {
  try {
    const value = storage?.getItem(storageKey(eventId));
    if (!value) return null;
    const attempt: unknown = JSON.parse(value);
    if (attempt && typeof attempt === 'object') {
      const row = attempt as Record<string, unknown>;
      if (
        row.eventId === eventId &&
        Number.isInteger(row.quantity) &&
        (row.quantity as number) >= 1 &&
        (row.quantity as number) <= 10 &&
        typeof row.key === 'string' &&
        uuid.test(row.key)
      )
        return row as unknown as BookingAttempt;
    }
  } catch {
    // Browser storage can be disabled or contain malformed data.
  }
  return null;
}

export function prepareBookingAttempt(
  storage: BookingStorage | null,
  eventId: string,
  quantity: number,
  generateKey: () => string,
): BookingAttempt {
  const existing = readBookingAttempt(storage, eventId);
  if (existing?.quantity === quantity) return existing;
  const attempt = { eventId, quantity, key: generateKey() };
  try {
    storage?.setItem(storageKey(eventId), JSON.stringify(attempt));
  } catch {
    // Keep the in-memory attempt if browser storage is unavailable.
  }
  return attempt;
}

export function clearBookingAttempt(
  storage: BookingStorage | null,
  eventId: string,
): void {
  try {
    storage?.removeItem(storageKey(eventId));
  } catch {
    // Storage failure should not hide a confirmed booking.
  }
}

export function finishBookingAttempt(
  storage: BookingStorage | null,
  eventId: string,
  status: string,
): void {
  // A timeout does not prove the booking failed; only confirmation can
  // release its key for a later, intentional booking.
  if (status === 'ok') clearBookingAttempt(storage, eventId);
}
