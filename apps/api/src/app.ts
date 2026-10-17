import Fastify, { type FastifyInstance } from 'fastify';
import { registerHealthRoutes } from './modules/health/routes.js';

export function buildApp(deps: {
  checkDatabase: () => Promise<boolean>;
}): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  registerHealthRoutes(app, deps.checkDatabase);
  return app;
}
