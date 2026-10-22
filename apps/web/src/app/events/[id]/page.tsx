import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchEvent } from '../../../lib/events';
import {
  eventDate,
  eventHours,
  eventSchedule,
} from '../../../lib/event-display';
import { BookingForm } from '../../bookings/booking-form';

export const dynamic = 'force-dynamic';

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await fetchEvent(id);
  if (result.status === 'not-found') notFound();
  const started =
    result.status === 'ok' && Date.parse(result.event.startsAt) <= Date.now();
  return (
    <main className="shell catalogue event-detail-page">
      <nav className="catalogue-nav">
        <Link className="brand" href="/">
          ticketforge<span className="brand-dot">.</span>
        </Link>
        <div className="auth-nav">
          <Link href="/events">← All events</Link>
          <Link href="/account">My bookings</Link>
        </div>
      </nav>
      {result.status === 'unavailable' ? (
        <p role="status" className="catalogue-message">
          This event is temporarily unavailable. Please try again later.
        </p>
      ) : (
        <>
          <div className="detail-art" aria-hidden="true">
            <span className="detail-art-orbit" />
            <span>TICKETFORGE / LIVE EXPERIENCES</span>
            <strong>BE THERE.</strong>
          </div>
          <div className="event-detail-layout">
            <article className="catalogue-header event-detail">
              <span className="section-index">
                02 / THE DETAILS · FREE EVENT
              </span>
              <h1>{result.event.title}</h1>
              <p className="event-description">{result.event.description}</p>
              <div className="event-facts">
                <div>
                  <span className="section-index">DATE &amp; TIME</span>
                  <time dateTime={result.event.startsAt}>
                    {eventSchedule(result.event)}
                  </time>
                </div>
                <div>
                  <span className="section-index">WHERE</span>
                  <span>{result.event.venue}</span>
                </div>
                <div>
                  <span className="section-index">AT A GLANCE</span>
                  <span>
                    {eventDate(result.event.startsAt).weekday} ·{' '}
                    {eventHours(result.event)}
                  </span>
                </div>
                <div>
                  <span className="section-index">YOUR BOOKING</span>
                  <span>Free · No payment or seat assignment</span>
                </div>
              </div>
            </article>
            <aside className="booking-panel" aria-label="Reserve tickets">
              <span className="section-index">03 / MAKE IT A PLAN</span>
              <h2>Save your place.</h2>
              <div className="booking-panel-summary">
                <span>Free booking</span>
                <strong>
                  {started
                    ? 'Event started'
                    : result.event.remainingSeats === 0
                      ? 'Sold out'
                      : `${result.event.remainingSeats} places left`}
                </strong>
              </div>
              {started ? (
                <p role="status">
                  This event has started. New bookings are closed.
                </p>
              ) : (
                <BookingForm
                  eventId={result.event.id}
                  remainingSeats={result.event.remainingSeats}
                />
              )}
              <p className="booking-fineprint">
                No payment or seat assignment. Book up to 10 places and manage
                or cancel your booking from your account before the event
                starts.
              </p>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
