import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { healthResponse, type HealthResponse } from '../../contracts/health.ts';

/**
 * GET /api/health — public liveness + DB connectivity.
 *
 * Decision A5: the route validates its own response against `healthResponse`
 * before sending. A drift in `contracts/health.ts` (e.g. a renamed field)
 * fails this parse and surfaces as a 500 via the error handler — not as
 * silent breakage in the browser.
 *
 * 200:  `{ status: 'ok',       db: 'up',   version }`
 * 503:  `{ status: 'degraded', db: 'down', version }`
 *
 * (No `schema.response` because Fastify's default JSON-schema serializer
 * does not understand zod. The runtime parse below is the same insurance,
 * with the contract source of truth still `healthResponse`.)
 */

const healthRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/api/health', async (_req, reply) => {
    let dbUp = false;
    try {
      await app.db.command({ ping: 1 });
      dbUp = true;
    } catch {
      dbUp = false;
    }

    const body: HealthResponse = healthResponse.parse({
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      version: app.backendVersion,
    });

    return reply.code(dbUp ? 200 : 503).send(body);
  });
};

export default healthRoutes;