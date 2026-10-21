'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cancelBooking } from '../../lib/bookings';

export async function cancelMyBooking(bookingId: string): Promise<void> {
  const token = (await cookies()).get('ticketforge_session')?.value;
  const result = token
    ? await cancelBooking(token, bookingId)
    : { status: 'unauthorized' as const };
  const status = result.status === 'invalid' ? 'not-found' : result.status;
  redirect(`/account?cancel=${status}`);
}
