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
  event: Pick<PublicEvent, 'title' | 'venue' | 'startsAt' | 'endsAt'>;
}

export interface BookingListResponse {
  bookings: PublicBooking[];
}
