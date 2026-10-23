'use server';

import { cookies } from 'next/headers';
import {
  holdCinemaSeats,
  fetchCinemaHold,
} from '../../../../../lib/cinema-bookings';

export async function holdSeats(
  cinemaId: string,
  screeningId: string,
  seatIds: string[],
  key: string,
) {
  const token = (await cookies()).get('ticketforge_session')?.value;
  if (!token) return { status: 'unauthorized' } as const;
  return holdCinemaSeats(token, cinemaId, screeningId, seatIds, key);
}

export async function getHold(id: string) {
  const token = (await cookies()).get('ticketforge_session')?.value;
  if (!token) return { status: 'unauthorized' } as const;
  return fetchCinemaHold(token, id);
}
