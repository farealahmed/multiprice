import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import { dateRangeQuerySchema, reportSummarySchema } from '../../contracts/report.ts';
import { createReportsRepository } from '../../persistence/reports.repository.ts';
import { summarizeReports } from '../../services/reports.ts';

const reportsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/api/v1/reports/summary', { preHandler: app.authenticate }, async (request, reply) => {
    const query = dateRangeQuerySchema.parse(request.query);
    const repository = createReportsRepository(app.db);
    const summary = await summarizeReports(request.userId!, query, repository);
    return reply.code(200).send(reportSummarySchema.parse(summary));
  });
};

export default reportsRoutes;
