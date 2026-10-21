'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Form, Formik } from 'formik';
import { NumberField } from '../forms/number-field';
import { bookTickets } from './actions';

export function BookingForm({
  eventId,
  remainingSeats,
}: {
  eventId: string;
  remainingSeats: number;
}) {
  const [status, setStatus] = useState<string | null>(null);
  if (remainingSeats === 0) return <p role="status">Sold out.</p>;
  return (
    <Formik
      initialValues={{ quantity: 1 }}
      validate={(values) => {
        const quantity = Number(values.quantity);
        return Number.isInteger(quantity) &&
          quantity >= 1 &&
          quantity <= Math.min(10, remainingSeats)
          ? {}
          : { quantity: `Choose 1–${Math.min(10, remainingSeats)} tickets.` };
      }}
      onSubmit={async (values, { setSubmitting }) => {
        const result = await bookTickets(eventId, Number(values.quantity));
        setStatus(result.status);
        setSubmitting(false);
      }}
    >
      {({ isSubmitting }) => (
        <Form>
          <NumberField
            name="quantity"
            label="Tickets"
            min={1}
            max={Math.min(10, remainingSeats)}
          />
          <button type="submit" disabled={isSubmitting || status === 'ok'}>
            Book tickets
          </button>
          {status === 'ok' && (
            <p role="status">
              Booked! <Link href="/account">View your bookings →</Link>
            </p>
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
            <p role="alert">Booking could not be completed. Try again later.</p>
          )}
        </Form>
      )}
    </Formik>
  );
}
