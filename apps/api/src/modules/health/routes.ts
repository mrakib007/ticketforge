import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@ticketforge/contracts';

export function registerHealthRoutes(
  app: FastifyInstance,
  checkDatabase: () => Promise<boolean>,
): void {
  app.get<{ Reply: HealthResponse }>('/health/live', async () => ({
    status: 'ok',
  }));

  app.get<{ Reply: HealthResponse }>(
    '/health/ready',
    async (request, reply) => {
      try {
        if (await checkDatabase()) return { status: 'ok' };
      } catch (error) {
        request.log.warn({ err: error }, 'Database readiness check failed');
      }
      return reply.code(503).send({ status: 'unavailable' });
    },
  );
}
