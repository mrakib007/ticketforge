'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUser } from '../../lib/auth-api';
import {
  getOrganizerEvent,
  saveOrganizerEvent,
  setEventPublication,
  type EventFields,
} from '../../lib/organizer';

async function organizerToken(): Promise<string> {
  const token = (await cookies()).get('ticketforge_session')?.value;
  if (!token || (await currentUser(token))?.role !== 'ORGANIZER')
    redirect('/login');
  return token;
}

export async function saveEvent(
  id: string | null,
  form: FormData,
): Promise<void> {
  const token = await organizerToken();
  const path = id ? `/organizer/${encodeURIComponent(id)}` : '/organizer/new';
  const text = (key: string) => form.get(key);
  const title = text('title');
  const description = text('description');
  const venue = text('venue');
  const startsAt = text('startsAt');
  const endsAt = text('endsAt');
  const capacity = text('capacity');
  if (
    [title, description, venue, startsAt, endsAt, capacity].some(
      (value) => typeof value !== 'string',
    )
  )
    redirect(`${path}?error=invalid`);
  const fields: EventFields = {
    title: title as string,
    description: description as string,
    venue: venue as string,
    startsAt: `${startsAt as string}:00.000Z`,
    endsAt: `${endsAt as string}:00.000Z`,
    capacity: Number(capacity),
  };
  let patch: Partial<EventFields> = fields;
  if (id) {
    const current = await getOrganizerEvent(token, id);
    if (current.status !== 'ok') redirect(`${path}?error=${current.status}`);
    patch = Object.fromEntries(
      (Object.keys(fields) as (keyof EventFields)[])
        .filter((key) => fields[key] !== current.value[key])
        .map((key) => [key, fields[key]]),
    ) as Partial<EventFields>;
    if (Object.keys(patch).length === 0) redirect(`${path}?notice=saved`);
  }
  const result = await saveOrganizerEvent(token, patch, id ?? undefined);
  if (result.status !== 'ok') redirect(`${path}?error=${result.status}`);
  redirect(`/organizer/${result.value.id}?notice=saved`);
}

export async function changePublication(
  id: string,
  publish: boolean,
): Promise<void> {
  const token = await organizerToken();
  const result = await setEventPublication(token, id, publish);
  redirect(
    `/organizer/${encodeURIComponent(id)}?${result.status === 'ok' ? `notice=${publish ? 'published' : 'unpublished'}` : `error=${result.status}`}`,
  );
}
