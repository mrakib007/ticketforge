'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Form, Formik } from 'formik';
import { NumberField } from '../forms/number-field';
import { bookTickets } from './actions';
import {
  clearBookingAttempt,
  finishBookingAttempt,
  prepareBookingAttempt,
  readBookingAttempt,
  type BookingAttempt,
  type BookingStorage,
} from './booking-attempt';

function browserStorage(): BookingStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function BookingForm({
  eventId,
  remainingSeats,
}: {
  eventId: string;
  remainingSeats: number;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<BookingAttempt | null>(null);
  const [initialQuantity, setInitialQuantity] = useState(1);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const restored = readBookingAttempt(browserStorage(), eventId);
    setPending(restored);
    setInitialQuantity(restored?.quantity ?? 1);
    setReady(true);
  }, [eventId]);

  if (!ready) return <p role="status">Preparing booking form…</p>;
  if (status === 'ok')
    return (
      <p role="status">
        Booked! <Link href="/account">View your bookings →</Link>
      </p>
    );
  if (remainingSeats === 0 && !pending) return <p role="status">Sold out.</p>;

  return (
    <Formik
      initialValues={{ quantity: initialQuantity }}
      validate={(values) => {
        const quantity = Number(values.quantity);
        if (pending && quantity === pending.quantity) return {};
        return Number.isInteger(quantity) &&
          quantity >= 1 &&
          quantity <= Math.min(10, remainingSeats)
          ? {}
          : { quantity: `Choose 1–${Math.min(10, remainingSeats)} tickets.` };
      }}
      onSubmit={async (values, { setSubmitting }) => {
        const quantity = Number(values.quantity);
        const attempt =
          pending?.quantity === quantity
            ? pending
            : prepareBookingAttempt(browserStorage(), eventId, quantity, () =>
                crypto.randomUUID(),
              );
        setPending(attempt);
        const result = await bookTickets(eventId, quantity, attempt.key);
        finishBookingAttempt(browserStorage(), eventId, result.status);
        if (result.status === 'ok') {
          setPending(null);
        }
        setStatus(result.status);
        setSubmitting(false);
      }}
    >
      {({ isSubmitting, resetForm }) => (
        <Form>
          {pending && (
            <p role="status">
              A booking attempt is pending. Retry to confirm it, or check your
              bookings before starting a new one.
            </p>
          )}
          <NumberField
            name="quantity"
            label="Tickets"
            min={1}
            max={pending ? pending.quantity : Math.min(10, remainingSeats)}
            disabled={!!pending}
          />
          <button type="submit" disabled={isSubmitting}>
            {pending ? 'Retry booking' : 'Book tickets'}
          </button>
          {pending && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                clearBookingAttempt(browserStorage(), eventId);
                setPending(null);
                setStatus(null);
                resetForm({ values: { quantity: 1 } });
              }}
            >
              Start a new booking
            </button>
          )}
          {status === 'unauthorized' && (
            <p role="alert">
              Please <Link href="/login">sign in</Link> to book.
            </p>
          )}
          {status === 'sold-out' && (
            <p role="alert">
              Not enough tickets remain. Refresh to see availability.
            </p>
          )}
          {status && !['ok', 'unauthorized', 'sold-out'].includes(status) && (
            <p role="alert">
              Booking could not be confirmed. Retry, or check your bookings.
            </p>
          )}
        </Form>
      )}
    </Formik>
  );
}
