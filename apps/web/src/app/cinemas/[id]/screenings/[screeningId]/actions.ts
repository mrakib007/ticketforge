'use server';

import { cookies } from 'next/headers';
import { reserveCinemaSeats } from '../../../../../lib/cinema-bookings';

export async function bookCinemaSeats(
  cinemaId: string,
  screeningId: string,
  seatIds: string[],
  key: string,
) {
  const token = (await cookies()).get('ticketforge_session')?.value;
  if (!token) return { status: 'unauthorized' } as const;
  return reserveCinemaSeats(token, cinemaId, screeningId, seatIds, key);
}
