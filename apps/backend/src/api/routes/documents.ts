import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import {
  createDocumentSchema,
  updateDocumentSchema,
  documentSummarySchema,
  documentListQuerySchema,
  DOCUMENT_NOT_FOUND,
} from '../../contracts/document.ts';
import { createDocumentsRepository } from '../../persistence/documents.repository.ts';
import {
  createDocument,
  updateDocument,
  removeDocument,
  toDocumentResponse,
  DocumentNotFoundError,
  DocumentAlreadyFinalizedError,
} from '../../services/documents.ts';
import { DOCUMENT_FINALIZED } from '../../contracts/lifecycle.ts';
import { mapPricingEngineError } from '../errors/engine-errors.ts';

function documentNotFoundEnvelope() {
  return {
    error: {
      code: DOCUMENT_NOT_FOUND,
      message: 'Document not found',
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

/**
 * Document routes surface engine failures as `VALIDATION_FAILED` with a
 * `details[]` entry, matching the envelope shape the rest of the API uses for
 * schema errors. The existing preview endpoint keeps its own root-level engine
 * code, so this wrapper reuses `mapPricingEngineError` only for the path/detail
 * mapping and lifts the result into a `VALIDATION_FAILED` envelope.
 */
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

const documentsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/api/v1/documents', { preHandler: app.authenticate }, async (request, reply) => {
    const query = documentListQuerySchema.parse(request.query);
    const repository = createDocumentsRepository(app.db);
    const stored = await repository.list(request.userId!, query);
    const summaries = stored.map((doc) =>
      documentSummarySchema.parse(toDocumentResponse(doc)),
    );
    return reply.code(200).send(summaries);
  });

  app.post('/api/v1/documents', { preHandler: app.authenticate }, async (request, reply) => {
    const repository = createDocumentsRepository(app.db);
    const input = createDocumentSchema.parse(request.body);

    try {
      const doc = await createDocument({
        ownerId: request.userId!,
        repository,
        metadata: { title: input.title, customer: input.customer, issueDate: input.issueDate },
        lines: input.lines,
      });
      return reply.code(201).send(doc);
    } catch (error) {
      if (error instanceof DocumentNotFoundError) {
        return reply.code(404).send(documentNotFoundEnvelope());
      }
      const envelope = mapDocumentEngineError(error);
      if (envelope != null) {
        return reply.code(400).send(envelope);
      }
      throw error;
    }
  });

  app.get('/api/v1/documents/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const repository = createDocumentsRepository(app.db);
    const { id } = request.params as { id: string };
    const stored = await repository.findById(request.userId!, id);

    if (!stored) {
      return reply.code(404).send(documentNotFoundEnvelope());
    }

    return reply.code(200).send(toDocumentResponse(stored));
  });

  app.patch('/api/v1/documents/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const repository = createDocumentsRepository(app.db);
    const { id } = request.params as { id: string };
    const input = updateDocumentSchema.parse(request.body);

    try {
      const doc = await updateDocument({
        ownerId: request.userId!,
        repository,
        id,
        metadata:
          input.title !== undefined || input.customer !== undefined || input.issueDate !== undefined
            ? {
                ...(input.title !== undefined && { title: input.title }),
                ...(input.customer !== undefined && { customer: input.customer }),
                ...(input.issueDate !== undefined && { issueDate: input.issueDate }),
              }
            : undefined,
        lines: input.lines,
      });
      return reply.code(200).send(doc);
    } catch (error) {
      if (error instanceof DocumentNotFoundError) {
        return reply.code(404).send(documentNotFoundEnvelope());
      }
      if (error instanceof DocumentAlreadyFinalizedError) {
        return reply.code(409).send(documentFinalizedEnvelope());
      }
      const envelope = mapDocumentEngineError(error);
      if (envelope != null) {
        return reply.code(400).send(envelope);
      }
      throw error;
    }
  });

  app.delete('/api/v1/documents/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const repository = createDocumentsRepository(app.db);
    const { id } = request.params as { id: string };

    try {
      await removeDocument({ ownerId: request.userId!, repository, id });
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof DocumentNotFoundError) {
        return reply.code(404).send(documentNotFoundEnvelope());
      }
      if (error instanceof DocumentAlreadyFinalizedError) {
        return reply.code(409).send(documentFinalizedEnvelope());
      }
      throw error;
    }
  });
};

export default documentsRoutes;
