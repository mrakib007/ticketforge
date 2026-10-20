import Fastify, { type FastifyInstance } from 'fastify';
import { registerHealthRoutes } from './modules/health/routes.js';
import { registerEventRoutes } from './modules/events/routes.js';
import type { EventReader } from './modules/events/repository.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import type { AuthRepository } from './modules/auth/repository.js';

export function buildApp(deps: {
  checkDatabase: () => Promise<boolean>;
  events?: EventReader;
  auth?: AuthRepository;
}): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  registerHealthRoutes(app, deps.checkDatabase);
  if (deps.events) registerEventRoutes(app, deps.events);
  if (deps.auth) registerAuthRoutes(app, deps.auth);
  return app;
}
