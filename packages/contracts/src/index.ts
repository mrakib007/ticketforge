export type HealthStatus = 'ok' | 'unavailable';

export interface HealthResponse {
  status: HealthStatus;
}

export interface PublicEvent {
  id: string;
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  remainingSeats: number;
}

export interface EventListResponse {
  events: PublicEvent[];
}

export interface PublicUser {
  id: string;
  email: string;
  role: 'ATTENDEE' | 'ORGANIZER';
}

export interface OrganizerEvent extends Omit<PublicEvent, 'remainingSeats'> {
  published: boolean;
  capacity: number;
  bookedSeats: number;
  remainingSeats: number;
  activeBookings: number;
  cancelledBookings: number;
}

export interface AuthResponse {
  user: PublicUser;
  token: string;
}

export interface PublicBooking {
  id: string;
  eventId: string;
  quantity: number;
  createdAt: string;
  cancelledAt: string | null;
  event: Pick<PublicEvent, 'title' | 'venue' | 'startsAt' | 'endsAt'>;
}

export interface BookingListResponse {
  bookings: PublicBooking[];
}

export interface PublicCinema {
  id: string;
  name: string;
  description: string;
  address: string;
  timeZone: string;
  imageUrl: string | null;
  isDemo: boolean;
}

export interface PublicMovie {
  id: string;
  title: string;
  synopsis: string;
  durationMinutes: number;
  posterUrl: string | null;
  releaseDate: string | null;
}

export interface PublicScreening {
  id: string;
  movie: PublicMovie;
  auditorium: { id: string; name: string };
  startsAt: string;
  endsAt: string;
  bookingClosesAt: string;
  priceMinor: number;
  currency: string;
}

export interface PublicScreeningDetail extends PublicScreening {
  seats: {
    id: string;
    rowLabel: string;
    seatNumber: number;
    category: string;
    booked: boolean;
  }[];
}

export interface PublicCinemaBooking {
  id: string;
  screeningId: string;
  seatIds: string[];
  createdAt: string;
}

export interface PublicCinemaBookingReceipt extends PublicCinemaBooking {
  cinemaId: string;
  cinemaName: string;
  movieTitle: string;
  startsAt: string;
  seats: { rowLabel: string; seatNumber: number }[];
}

export interface PublicCinemaHold {
  id: string;
  screeningId: string;
  seatIds: string[];
  status:
    | 'HOLDING'
    | 'EXPIRED'
    | 'PAYMENT_FAILED'
    | 'CONFIRMED'
    | 'PAID_UNFULFILLED';
  expiresAt: string;
  totalMinor: number;
  currency: string;
}
