import React from 'react';
import Link from 'next/link';
import type { PublicEvent } from '@ticketforge/contracts';
import { eventDate, eventHours } from '../../lib/event-display';

export function EventCard({
  event,
  index,
  headingLevel = 'h3',
}: {
  event: PublicEvent;
  index: number;
  headingLevel?: 'h2' | 'h3';
}) {
  const date = eventDate(event.startsAt);
  const Heading = headingLevel;
  return (
    <li className="experience-card">
      <div
        className={`experience-art experience-art-${index % 4}`}
        aria-hidden="true"
      >
        <span className="experience-art-ring" />
        <span className="experience-art-index">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="experience-art-label">
          TICKETFORGE / LIVE EXPERIENCES
        </span>
      </div>
      <div className="experience-body">
        <div className="experience-topline">
          <time
            className="experience-date"
            dateTime={event.startsAt}
            aria-label={`${date.weekday}, ${date.month} ${date.day}, UTC`}
          >
            <span>{date.month}</span>
            <strong>{date.day}</strong>
          </time>
          <span
            className={`experience-availability ${event.remainingSeats === 0 ? 'is-sold-out' : ''}`}
          >
            {event.remainingSeats === 0
              ? 'Sold out'
              : `${event.remainingSeats} places left`}
          </span>
        </div>
        <div className="experience-copy">
          <span className="section-index">{date.weekday} · Free booking</span>
          <Heading>
            <Link href={`/events/${event.id}`}>{event.title}</Link>
          </Heading>
          <p>{event.description}</p>
        </div>
        <div className="experience-bottomline">
          <span>
            {event.venue} <span aria-hidden="true">·</span> {eventHours(event)}
          </span>
          <Link
            className="event-link"
            href={`/events/${event.id}`}
            aria-label={`View ${event.title}`}
          >
            Explore event <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </li>
  );
}
