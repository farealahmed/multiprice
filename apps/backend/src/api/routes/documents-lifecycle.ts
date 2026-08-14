import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import { createDocumentsRepository } from '../../persistence/documents.repository.ts';
import {
  finalizeDocument,
  duplicateDocument,
  DocumentHasNoLinesError,
  DocumentAlreadyFinalizedError,
} from '../../services/lifecycle.ts';
import { DocumentNotFoundError } from '../../services/documents.ts';
import { DOCUMENT_HAS_NO_LINES, DOCUMENT_FINALIZED } from '../../contracts/lifecycle.ts';
import { mapPricingEngineError } from '../errors/engine-errors.ts';

function documentNotFoundEnvelope() {
  return {
    error: {
      code: 'DOCUMENT_NOT_FOUND',
      message: 'Document not found',
    },
  };
}

function documentHasNoLinesEnvelope() {
  return {
    error: {
      code: DOCUMENT_HAS_NO_LINES,
      message: 'Document has no lines',
    },
  };
}

function documentFinalizedEnvelope() {
  return {
    error: {
      code: DOCUMENT_FINALIZED,
      message: 'Document is already finalized',
    },
  };
}

function mapDocumentEngineError(error: unknown): { error: { code: 'VALIDATION_FAILED'; message: string; details: Array<{ path: string; code: string; message: string }> } } | null {
  const mapped = mapPricingEngineError(error);
  if (mapped == null) return null;
  return {
    error: {
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      details: mapped.error.details ?? [],
    },
  };
}

const lifecycleRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post(
    '/api/v1/documents/:id/finalize',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const repository = createDocumentsRepository(app.db);
      const { id } = request.params as { id: string };

      try {
        const doc = await finalizeDocument({
          ownerId: request.userId!,
          repository,
          id,
        });
        return reply.code(200).send(doc);
      } catch (error) {
        if (error instanceof DocumentNotFoundError) {
          return reply.code(404).send(documentNotFoundEnvelope());
        }
        if (error instanceof DocumentHasNoLinesError) {
          return reply.code(400).send(documentHasNoLinesEnvelope());
        }
        const engineEnvelope = mapDocumentEngineError(error);
        if (engineEnvelope != null) {
          return reply.code(400).send(engineEnvelope);
        }
        if (error instanceof DocumentAlreadyFinalizedError) {
          return reply.code(409).send(documentFinalizedEnvelope());
        }
        throw error;
      }
    },
  );

  app.post(
    '/api/v1/documents/:id/duplicate',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const repository = createDocumentsRepository(app.db);
      const { id } = request.params as { id: string };

      try {
        const doc = await duplicateDocument({
          ownerId: request.userId!,
          repository,
          id,
        });
        return reply.code(201).send(doc);
      } catch (error) {
        if (error instanceof DocumentNotFoundError) {
          return reply.code(404).send(documentNotFoundEnvelope());
        }
        throw error;
      }
    },
  );
};

export default lifecycleRoutes;
