import React from 'react';
import type { OrganizerEvent } from '@ticketforge/contracts';
import { saveEvent } from './actions';

export function EventForm({ event }: { event?: OrganizerEvent }) {
  const locked = !!event?.bookedSeats;
  return (
    <form
      action={saveEvent.bind(null, event?.id ?? null)}
      className="organizer-form"
    >
      <label>
        Event title
        <input
          name="title"
          required
          maxLength={160}
          defaultValue={event?.title}
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          required
          maxLength={4000}
          rows={4}
          defaultValue={event?.description}
        />
      </label>
      <label>
        Venue
        <input
          name="venue"
          required
          maxLength={200}
          defaultValue={event?.venue}
          readOnly={locked}
        />
      </label>
      <label>
        Starts at (UTC)
        <input
          name="startsAt"
          type="datetime-local"
          required
          defaultValue={event?.startsAt.slice(0, 16)}
          readOnly={locked}
        />
      </label>
      <label>
        Ends at (UTC)
        <input
          name="endsAt"
          type="datetime-local"
          required
          defaultValue={event?.endsAt.slice(0, 16)}
          readOnly={locked}
        />
      </label>
      <label>
        Capacity
        <input
          name="capacity"
          type="number"
          min={locked ? event?.capacity : 0}
          max={1000000}
          required
          defaultValue={event?.capacity ?? 100}
        />
      </label>
      {locked && (
        <p>
          Bookings exist. Venue and schedule are locked; capacity can only
          increase.
        </p>
      )}
      <button className="button-primary" type="submit">
        {event ? 'Save changes' : 'Create draft'}
      </button>
    </form>
  );
}
