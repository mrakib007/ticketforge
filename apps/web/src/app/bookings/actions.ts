'use server';

import { cookies } from 'next/headers';
import { createBooking } from '../../lib/bookings';

export async function bookTickets(eventId: string, quantity: number) {
  const token = (await cookies()).get('ticketforge_session')?.value;
  if (!token) return { status: 'unauthorized' } as const;
  const result = await createBooking(token, eventId, quantity);
  return result.status === 'ok'
    ? ({ status: 'ok' } as const)
    : { status: result.status };
}
