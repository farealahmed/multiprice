import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import {
  lineItemInputSchema,
  updateLineItemSchema,
  DOCUMENT_NOT_FOUND,
  LINE_NOT_FOUND,
} from '../../contracts/document.ts';
import type { LineItemInput } from '../../contracts/document.ts';
import type { StoredLineItem } from '../../domain/document.ts';
import { createDocumentsRepository } from '../../persistence/documents.repository.ts';
import { updateDocument, DocumentNotFoundError } from '../../services/documents.ts';
import { mapPricingEngineError } from '../errors/engine-errors.ts';

function documentNotFoundEnvelope() {
  return {
    error: {
      code: DOCUMENT_NOT_FOUND,
      message: 'Document not found',
    },
  };
}

function lineNotFoundEnvelope() {
  return {
    error: {
      code: LINE_NOT_FOUND,
      message: 'Line not found',
    },
  };
}

/**
 * Document routes surface engine failures as `VALIDATION_FAILED` with a
 * `details[]` entry. Reuses `mapPricingEngineError` for path/detail mapping
 * and lifts the result into the schema-error envelope shape.
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

/** Converts a persisted stored line back to the wire input scale so it can be
 *  passed to `updateDocument` alongside new or edited lines. */
function toLineInput(stored: StoredLineItem): LineItemInput {
  return {
    id: stored.id,
    description: stored.description,
    quantity: stored.quantity / 1000,
    unitPrice: stored.unitPrice / 100,
    discount:
      stored.discount.type === 'none'
        ? { type: 'none' as const }
        : stored.discount.type === 'percent'
          ? { type: 'percent' as const, value: stored.discount.value / 100 }
          : { type: 'fixed' as const, value: stored.discount.value / 100 },
    taxPercent: stored.taxPercent == null ? null : stored.taxPercent / 100,
  };
}

const documentLinesRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post('/api/v1/documents/:id/lines', { preHandler: app.authenticate }, async (request, reply) => {
    const repository = createDocumentsRepository(app.db);
    const { id } = request.params as { id: string };
    const input = lineItemInputSchema.parse(request.body);

    const stored = await repository.findById(request.userId!, id);
    if (!stored) {
      return reply.code(404).send(documentNotFoundEnvelope());
    }

    const lines: LineItemInput[] = [...stored.lines.map(toLineInput), input];

    try {
      const doc = await updateDocument({ ownerId: request.userId!, repository, id, lines });
      return reply.code(200).send(doc);
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

  app.patch('/api/v1/documents/:id/lines/:lineId', { preHandler: app.authenticate }, async (request, reply) => {
    const repository = createDocumentsRepository(app.db);
    const { id, lineId } = request.params as { id: string; lineId: string };
    const patch = updateLineItemSchema.parse(request.body);

    const stored = await repository.findById(request.userId!, id);
    if (!stored) {
      return reply.code(404).send(documentNotFoundEnvelope());
    }

    const lineIndex = stored.lines.findIndex((line) => line.id === lineId);
    if (lineIndex === -1) {
      return reply.code(404).send(lineNotFoundEnvelope());
    }

    const existing = toLineInput(stored.lines[lineIndex]!);
    const merged = lineItemInputSchema.parse({ ...existing, ...patch });

    const lines: LineItemInput[] = stored.lines.map(toLineInput);
    lines[lineIndex] = merged;

    try {
      const doc = await updateDocument({ ownerId: request.userId!, repository, id, lines });
      return reply.code(200).send(doc);
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

  app.delete('/api/v1/documents/:id/lines/:lineId', { preHandler: app.authenticate }, async (request, reply) => {
    const repository = createDocumentsRepository(app.db);
    const { id, lineId } = request.params as { id: string; lineId: string };

    const stored = await repository.findById(request.userId!, id);
    if (!stored) {
      return reply.code(404).send(documentNotFoundEnvelope());
    }

    if (!stored.lines.some((line) => line.id === lineId)) {
      return reply.code(404).send(lineNotFoundEnvelope());
    }

    const lines: LineItemInput[] = stored.lines
      .filter((line) => line.id !== lineId)
      .map(toLineInput);

    try {
      const doc = await updateDocument({ ownerId: request.userId!, repository, id, lines });
      return reply.code(200).send(doc);
    } catch (error) {
      if (error instanceof DocumentNotFoundError) {
        return reply.code(404).send(documentNotFoundEnvelope());
      }
      throw error;
    }
  });
};

export default documentLinesRoutes;
