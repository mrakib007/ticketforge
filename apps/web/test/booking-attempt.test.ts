import { expect, it, vi } from 'vitest';
import {
  clearBookingAttempt,
  finishBookingAttempt,
  prepareBookingAttempt,
  readBookingAttempt,
} from '../src/app/bookings/booking-attempt';

const eventId = '8dd0b3a5-7371-46a0-82be-1ee52a9dc8b5';
const otherEvent = '870b5d13-978e-4557-8905-b59c3dfd9a95';
const key = 'a9947927-4062-45d6-a647-0e2c9b41e886';

function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (name: string) => data.get(name) ?? null,
    setItem: (name: string, value: string) => {
      data.set(name, value);
    },
    removeItem: (name: string) => {
      data.delete(name);
    },
  };
}

it('persists the key before submission and restores it and the quantity after a refresh', () => {
  const store = storage();
  const generateKey = vi.fn(() => key);
  const first = prepareBookingAttempt(store, eventId, 2, generateKey);
  expect(first).toEqual({ eventId, quantity: 2, key });
  const restored = readBookingAttempt(store, eventId);
  expect(restored).toEqual(first);
  expect(prepareBookingAttempt(store, eventId, 2, generateKey)).toEqual(first);
  expect(generateKey).toHaveBeenCalledTimes(1);
  expect(readBookingAttempt(store, otherEvent)).toBeNull();
});

it('replaces a pending attempt only for a different intent and clears it after confirmation', () => {
  const store = storage();
  const generateKey = vi
    .fn()
    .mockReturnValueOnce(key)
    .mockReturnValueOnce('b9947927-4062-45d6-a647-0e2c9b41e886');
  prepareBookingAttempt(store, eventId, 2, generateKey);
  const newAttempt = prepareBookingAttempt(store, eventId, 3, generateKey);
  expect(newAttempt.key).not.toBe(key);
  finishBookingAttempt(store, eventId, 'unavailable');
  expect(readBookingAttempt(store, eventId)).toEqual(newAttempt);
  finishBookingAttempt(store, eventId, 'sold-out');
  expect(readBookingAttempt(store, eventId)).toEqual(newAttempt);
  finishBookingAttempt(store, eventId, 'ok');
  expect(readBookingAttempt(store, eventId)).toBeNull();
  prepareBookingAttempt(store, eventId, 1, () => key);
  clearBookingAttempt(store, eventId);
  expect(readBookingAttempt(store, eventId)).toBeNull();
});

it('ignores malformed or inaccessible browser storage without reusing a forged key', () => {
  const store = storage();
  store.setItem(
    `ticketforge_booking:${eventId}`,
    JSON.stringify({ eventId, quantity: 2, key: 'bad' }),
  );
  expect(readBookingAttempt(store, eventId)).toBeNull();
  const unavailable = {
    getItem: () => {
      throw new Error('storage disabled');
    },
    setItem: () => {
      throw new Error('storage disabled');
    },
    removeItem: () => {
      throw new Error('storage disabled');
    },
  };
  expect(readBookingAttempt(unavailable, eventId)).toBeNull();
  expect(prepareBookingAttempt(unavailable, eventId, 1, () => key).key).toBe(
    key,
  );
  expect(() => clearBookingAttempt(unavailable, eventId)).not.toThrow();
});
