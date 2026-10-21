import Fastify, { type FastifyInstance } from 'fastify';
import { registerHealthRoutes } from './modules/health/routes.js';
import { registerEventRoutes } from './modules/events/routes.js';
import type { EventReader } from './modules/events/repository.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import type { AuthRepository } from './modules/auth/repository.js';
import type { AuthRateLimiter } from './modules/auth/rate-limit.js';
import { registerBookingRoutes } from './modules/bookings/routes.js';
import type { BookingRepository } from './modules/bookings/repository.js';

export function buildApp(deps: {
  checkDatabase: () => Promise<boolean>;
  events?: EventReader;
  auth?: AuthRepository;
  authRateLimiter?: AuthRateLimiter;
  bookings?: BookingRepository;
  sessionReader?: Pick<AuthRepository, 'findSession'>;
}): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  registerHealthRoutes(app, deps.checkDatabase);
  if (deps.events) registerEventRoutes(app, deps.events);
  if (deps.auth) registerAuthRoutes(app, deps.auth, deps.authRateLimiter);
  const sessions = deps.sessionReader ?? deps.auth;
  if (deps.bookings && sessions) registerBookingRoutes(app, deps.bookings, sessions);
  return app;
}
