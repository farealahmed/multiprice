import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import { mapPricingEngineError } from '../errors/engine-errors.ts';
import { documentResultSchema, previewRequestSchema } from '../../contracts/pricing.ts';
import { previewPricing } from '../../services/pricing-preview.ts';

/** Public, stateless pricing preview endpoint. */
const pricingRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post('/api/v1/pricing/preview', async (request, reply) => {
    const { lines } = previewRequestSchema.parse(request.body);

    try {
      const body = documentResultSchema.parse(previewPricing(lines));
      return reply.code(200).send(body);
    } catch (error) {
      const envelope = mapPricingEngineError(error);
      if (envelope != null) {
        return reply.code(400).send(envelope);
      }
      throw error;
    }
  });
};

export default pricingRoutes;
