'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  PublicCinemaHold,
  PublicScreeningDetail,
} from '@ticketforge/contracts';
import { cinemaPrice } from '../../../../../lib/cinema';
import { getHold, holdSeats } from './actions';

type Attempt = { key: string; seatIds: string[]; holdId?: string };
function storageKey(screeningId: string) {
  return `cinema-hold-attempt:${screeningId}`;
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
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(
        row.key,
      ) ||
      !Array.isArray(row.seatIds) ||
      row.seatIds.length < 1 ||
      row.seatIds.length > 10 ||
      new Set(row.seatIds).size !== row.seatIds.length ||
      !row.seatIds.every(
        (id: unknown) => typeof id === 'string' && valid.has(id),
      ) ||
      (row.holdId !== undefined &&
        (typeof row.holdId !== 'string' || !/^[\da-f-]{36}$/i.test(row.holdId)))
    )
      return null;
    return {
      key: row.key,
      seatIds: row.seatIds as string[],
      ...(row.holdId ? { holdId: row.holdId as string } : {}),
    };
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
  const [hold, setHold] = useState<PublicCinemaHold | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const attempt = readAttempt(
      screening.id,
      new Set(screening.seats.map((seat) => seat.id)),
    );
    setPending(attempt);
    setSelected(attempt?.seatIds ?? []);
    setReady(true);
    if (attempt?.holdId) {
      void getHold(attempt.holdId).then((result) => {
        if (
          result.status === 'ok' &&
          result.hold.screeningId === screening.id &&
          result.hold.seatIds.length === attempt.seatIds.length &&
          result.hold.seatIds.every((id) => attempt.seatIds.includes(id))
        ) {
          setHold(result.hold);
          setStatus(result.hold.status === 'HOLDING' ? 'held' : 'expired');
        } else {
          setStatus(
            result.status === 'unauthorized' ? 'unauthorized' : 'unavailable',
          );
        }
      });
    }
  }, [screening.id, screening.seats]);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const closed = Date.parse(screening.bookingClosesAt) <= now;
  const remaining =
    hold?.status === 'HOLDING'
      ? Math.max(0, Math.ceil((Date.parse(hold.expiresAt) - now) / 1000))
      : 0;
  const active = !!hold && hold.status === 'HOLDING' && remaining > 0;
  useEffect(() => {
    if (hold?.status === 'HOLDING' && remaining === 0 && status === 'held') {
      setStatus('expired');
      router.refresh();
    }
  }, [hold, remaining, router, status]);
  function reset() {
    sessionStorage.removeItem(storageKey(screening.id));
    setPending(null);
    setHold(null);
    setSelected([]);
    setStatus(null);
    router.refresh();
  }
  async function requestHold() {
    if (sending || selected.length === 0 || closed || active) return;
    const attempt = pending ?? { key: crypto.randomUUID(), seatIds: selected };
    // The same key and selection survive uncertain responses and page refreshes.
    sessionStorage.setItem(storageKey(screening.id), JSON.stringify(attempt));
    setPending(attempt);
    setSending(true);
    const result = await holdSeats(
      cinemaId,
      screening.id,
      attempt.seatIds,
      attempt.key,
    );
    setSending(false);
    if (result.status === 'ok') {
      const saved = { ...attempt, holdId: result.hold.id };
      sessionStorage.setItem(storageKey(screening.id), JSON.stringify(saved));
      setPending(saved);
      setHold(result.hold);
      setStatus(result.hold.status === 'HOLDING' ? 'held' : 'expired');
      router.refresh();
    } else {
      setStatus(result.status);
    }
  }
  return (
    <>
      <p role="status">
        {closed
          ? 'Holding has closed for this showtime.'
          : 'Choose up to 10 seats. Dark seats are unavailable (held or previously booked). A hold expires automatically; it is not a booking or a ticket.'}
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
                  title={`${seat.rowLabel}${seat.seatNumber} · ${seat.category}${seat.booked ? ' · unavailable' : ''}`}
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
          {selected.length} of 10 seats selected · Demo total{' '}
          {cinemaPrice(
            screening.priceMinor * selected.length,
            screening.currency,
          )}
          . No payment is taken; held seats are not confirmed.
        </p>
        {!active && (
          <button
            type="button"
            onClick={() => void requestHold()}
            disabled={
              !ready || closed || sending || selected.length === 0 || !!hold
            }
          >
            {sending ? 'Holding…' : pending ? 'Retry hold' : 'Hold seats →'}
          </button>
        )}
        {pending && (
          <button
            type="button"
            className="booking-secondary-action"
            disabled={sending}
            onClick={reset}
          >
            Forget selection / refresh availability
          </button>
        )}
        {active && (
          <p role="status">
            Seats held for {Math.floor(remaining / 60)}:
            {String(remaining % 60).padStart(2, '0')}. Total{' '}
            {cinemaPrice(hold.totalMinor, hold.currency)}. Checkout is not
            available yet; this hold is not a purchase. Seats release
            automatically at expiry, even if you close this page.
          </p>
        )}
        {hold &&
          !active &&
          (hold.status === 'HOLDING' || hold.status === 'EXPIRED') && (
            <p role="status">
              This hold has expired. Seats are available again unless another
              customer claimed them. Start over to select seats.
            </p>
          )}
        {hold && hold.status === 'CONFIRMED' && (
          <p role="status">
            This selection is confirmed. Check your receipt; do not create
            another hold.
          </p>
        )}
        {hold &&
          (hold.status === 'PAYMENT_FAILED' ||
            hold.status === 'PAID_UNFULFILLED') && (
            <p role="alert">
              This hold needs payment recovery. Do not assume these seats are
              confirmed.
            </p>
          )}
        {status === 'unauthorized' && (
          <p role="alert">
            Please <Link href="/login">sign in</Link> to hold seats.
          </p>
        )}
        {status === 'limit' && (
          <p role="alert">
            You already have 10 seats for this showtime (or this selection would
            exceed 10).
          </p>
        )}
        {status === 'taken' && (
          <p role="alert">
            A selected seat is no longer available. Check availability to choose
            again.
          </p>
        )}
        {status === 'not-found' && (
          <p role="alert">This showtime is no longer open for holding.</p>
        )}
        {status === 'conflict' && (
          <p role="alert">
            This request was already used for a different selection. Check
            availability before starting over.
          </p>
        )}
        {status === 'unavailable' && (
          <p role="alert">
            The hold outcome is uncertain. Retry the same selection and key
            before starting over.
          </p>
        )}
      </div>
    </>
  );
}
