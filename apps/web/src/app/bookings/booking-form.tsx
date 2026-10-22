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
      <div className="booking-confirmation" role="status">
        <span className="section-index">YOU’RE ON THE LIST</span>
        <h3>Booking confirmed.</h3>
        <p>Your free booking is in your account. No payment was taken.</p>
        <Link className="button-primary" href="/account">
          View your bookings →
        </Link>
      </div>
    );
  if (remainingSeats === 0 && !pending)
    return (
      <p role="status" className="booking-alert">
        Sold out. No places are available for new bookings.
      </p>
    );

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
      {({ isSubmitting, resetForm, values }) => (
        <Form>
          {pending && (
            <p role="status" className="booking-alert">
              This booking may have reached us. Retry the same request safely,
              or check your bookings before starting a new one.
            </p>
          )}
          <NumberField
            name="quantity"
            label="Number of places"
            min={1}
            max={pending ? pending.quantity : Math.min(10, remainingSeats)}
            disabled={!!pending}
          />
          <p className="booking-order-summary">
            {Number(values.quantity) || 0}{' '}
            {Number(values.quantity) === 1 ? 'place' : 'places'}{' '}
            <strong>Free</strong>
          </p>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Confirming…'
              : pending
                ? 'Retry confirmation'
                : 'Confirm free booking →'}
          </button>
          {pending && (
            <button
              className="booking-secondary-action"
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
              Not enough places remain. Check your bookings before retrying or
              starting a new request.
            </p>
          )}
          {status === 'not-found' && (
            <p role="alert">
              This event is no longer open for bookings. Browse other events.
            </p>
          )}
          {status === 'conflict' && (
            <p role="alert">
              This booking request was used for a different selection. Check
              your bookings before starting over.
            </p>
          )}
          {status &&
            !['ok', 'unauthorized', 'sold-out'].includes(status) &&
            !['not-found', 'conflict'].includes(status) && (
              <p role="alert">
                We couldn’t confirm your booking just now. Retry the same
                request or check your account before trying again.
              </p>
            )}
        </Form>
      )}
    </Formik>
  );
}
