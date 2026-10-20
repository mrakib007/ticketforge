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
}

export interface EventListResponse {
  events: PublicEvent[];
}
