'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PublicScreeningDetail } from '@ticketforge/contracts';
import { bookCinemaSeats } from './actions';

type Attempt = { key: string; seatIds: string[] };
function storageKey(screeningId: string) {
  return `cinema-attempt:${screeningId}`;
}
function readAttempt(screeningId: string, valid: Set<string>): Attempt | null {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(storageKey(screeningId)) ?? 'null',
    );
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (
      typeof row.key !== 'string' ||
      !/^[\da-f-]{36}$/.test(row.key) ||
      !Array.isArray(row.seatIds) ||
      row.seatIds.length < 1 ||
      row.seatIds.length > 10 ||
      new Set(row.seatIds).size !== row.seatIds.length ||
      !row.seatIds.every(
        (id: unknown) => typeof id === 'string' && valid.has(id),
      )
    )
      return null;
    return { key: row.key, seatIds: row.seatIds as string[] };
  } catch {
    return null;
  }
}

export function SeatPicker({
  cinemaId,
  screening,
}: {
  cinemaId: string;
  screening: PublicScreeningDetail;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState<Attempt | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const attempt = readAttempt(
      screening.id,
      new Set(screening.seats.map((seat) => seat.id)),
    );
    setPending(attempt);
    setSelected(attempt?.seatIds ?? []);
    setReady(true);
  }, [screening.id, screening.seats]);
  const closed = Date.parse(screening.bookingClosesAt) <= Date.now();
  function reset() {
    sessionStorage.removeItem(storageKey(screening.id));
    setPending(null);
    setSelected([]);
    setStatus(null);
    router.refresh();
  }
  async function confirm() {
    if (sending || selected.length === 0 || closed) return;
    const attempt = pending ?? { key: crypto.randomUUID(), seatIds: selected };
    // Persist before sending so a timeout or refresh can retry this exact
    // request; the server's idempotency key makes replay safe.
    sessionStorage.setItem(storageKey(screening.id), JSON.stringify(attempt));
    setPending(attempt);
    setSending(true);
    const result = await bookCinemaSeats(
      cinemaId,
      screening.id,
      attempt.seatIds,
      attempt.key,
    );
    setSending(false);
    setStatus(result.status);
    if (result.status === 'ok') {
      sessionStorage.removeItem(storageKey(screening.id));
      setPending(null);
      setSelected([]);
      router.refresh();
    }
  }
  return (
    <>
      <p role="status">
        {closed
          ? 'Booking has closed for this showtime.'
          : 'Choose up to 10 seats. Dark seats are already booked. Availability can change until confirmation.'}
      </p>
      <div className="cinema-seat-scroll">
        <div className="cinema-seat-layout">
          <div className="cinema-screen">SCREEN</div>
          <div className="cinema-seat-map">
            {screening.seats.map((seat) => {
              const chosen = selected.includes(seat.id);
              const retrying = pending?.seatIds.includes(seat.id);
              return (
                <button
                  type="button"
                  className="cinema-seat"
                  key={seat.id}
                  title={`${seat.rowLabel}${seat.seatNumber} · ${seat.category}${seat.booked ? ' · booked' : ''}`}
                  aria-pressed={chosen}
                  disabled={
                    !ready ||
                    closed ||
                    sending ||
                    !!pending ||
                    (seat.booked && !retrying)
                  }
                  data-booked={seat.booked && !retrying}
                  data-selected={chosen}
                  onClick={() =>
                    setSelected((current) =>
                      chosen
                        ? current.filter((id) => id !== seat.id)
                        : current.length < 10
                          ? [...current, seat.id]
                          : current,
                    )
                  }
                >
                  {seat.rowLabel}
                  {seat.seatNumber}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="cinema-seat-actions">
        <p>
          {selected.length} of 10 seats selected · No payment is taken in this
          demo.
        </p>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={!ready || closed || sending || selected.length === 0}
        >
          {sending
            ? 'Confirming…'
            : pending
              ? 'Retry confirmation'
              : 'Confirm seats →'}
        </button>
        {pending && (
          <button
            type="button"
            className="booking-secondary-action"
            disabled={sending}
            onClick={reset}
          >
            Check availability / start over
          </button>
        )}
        {status === 'ok' && (
          <p role="status">
            Seats confirmed for this showtime. No payment was taken.{' '}
            <Link href="/cinemas/my-bookings">View your seats →</Link>
          </p>
        )}
        {status === 'unauthorized' && (
          <p role="alert">
            Please <Link href="/login">sign in</Link> to book seats.
          </p>
        )}
        {status === 'limit' && (
          <p role="alert">
            You already have 10 tickets for this showtime (or this selection
            would exceed 10).
          </p>
        )}
        {status === 'taken' && (
          <p role="alert">
            A selected seat is no longer available. Check availability to choose
            again.
          </p>
        )}
        {status === 'not-found' && (
          <p role="alert">This showtime is no longer open for booking.</p>
        )}
        {status === 'conflict' && (
          <p role="alert">
            This request was already used for a different selection. Check your
            bookings before starting over.
          </p>
        )}
        {status === 'unavailable' && (
          <p role="alert">
            Confirmation is uncertain. Retry the same selection or{' '}
            <Link href="/cinemas/my-bookings">check your cinema bookings</Link>{' '}
            before starting over.
          </p>
        )}
      </div>
    </>
  );
}
