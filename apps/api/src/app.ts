import Fastify, { type FastifyInstance } from 'fastify';
import { registerHealthRoutes } from './modules/health/routes.js';
import { registerEventRoutes } from './modules/events/routes.js';
import type { EventReader } from './modules/events/repository.js';

export function buildApp(deps: {
  checkDatabase: () => Promise<boolean>;
  events?: EventReader;
}): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  registerHealthRoutes(app, deps.checkDatabase);
  if (deps.events) registerEventRoutes(app, deps.events);
  return app;
}
