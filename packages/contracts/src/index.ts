export type HealthStatus = 'ok' | 'unavailable';

export interface HealthResponse {
  status: HealthStatus;
}
