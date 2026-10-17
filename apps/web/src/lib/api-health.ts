import type { HealthStatus } from '@ticketforge/contracts';

export async function fetchApiHealth(): Promise<HealthStatus> {
  try {
    const baseUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';
    const response = await fetch(new URL('/health/ready', baseUrl), {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return 'unavailable';
    const body: unknown = await response.json();
    return typeof body === 'object' &&
      body !== null &&
      'status' in body &&
      body.status === 'ok'
      ? 'ok'
      : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
