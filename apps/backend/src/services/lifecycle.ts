import { calculateDocument } from '../pricing/index.ts';
import type { PricingError } from '../pricing/index.ts';
import type { DocumentsRepository } from '../persistence/documents.repository.ts';
import type { StoredDocument, StoredLineItem } from '../domain/document.ts';
import type { DocumentResponse } from '../contracts/document.ts';
import { DOCUMENT_HAS_NO_LINES, DOCUMENT_FINALIZED } from '../contracts/lifecycle.ts';
import {
  DocumentNotFoundError,
  toDocumentResponse,
} from './documents.ts';
import {
  findFailingLine,
  PricingPreviewError,
} from './pricing-preview.ts';

/** Thrown when an attempt is made to finalize a document that has no line items. */
export class DocumentHasNoLinesError extends Error {
  readonly code: typeof DOCUMENT_HAS_NO_LINES = DOCUMENT_HAS_NO_LINES;

  constructor() {
    super('Document has no lines');
    this.name = 'DocumentHasNoLinesError';
  }
}

/** Thrown when a concurrent finalization has already flipped the document to finalized. */
export class DocumentAlreadyFinalizedError extends Error {
  readonly code: typeof DOCUMENT_FINALIZED = DOCUMENT_FINALIZED;

  constructor() {
    super('Document is already finalized');
    this.name = 'DocumentAlreadyFinalizedError';
  }
}

/**
 * Finalizes a draft document after checking preconditions.
 *
 * Preconditions (in order):
 *  1. The document exists and is owned by the caller.
 *  2. The document has at least one line item.
 *  3. The persisted lines still pass the pricing engine (defensive validation only).
 *
 * The atomic `finalizeIfDraft` write only flips `status` and `updatedAt`; totals are
 * never recomputed or overwritten by this path.
 */
export async function finalizeDocument(params: {
  ownerId: string;
  repository: DocumentsRepository;
  id: string;
}): Promise<DocumentResponse> {
  const { ownerId, repository, id } = params;

  const stored = await repository.findById(ownerId, id);
  if (!stored) {
    throw new DocumentNotFoundError();
  }

  if (stored.lines.length === 0) {
    throw new DocumentHasNoLinesError();
  }

  const engineLines = stored.lines.map(toEngineLineWire);
  try {
    calculateDocument(engineLines);
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      const pricingError = error as PricingError;
      throw new PricingPreviewError(
        pricingError,
        findFailingLine(engineLines, pricingError.code),
      );
    }
    throw error;
  }

  const finalized = await repository.finalizeIfDraft(ownerId, id);
  if (!finalized) {
    throw new DocumentAlreadyFinalizedError();
  }

  return toDocumentResponse(finalized);
}

/** Converts a stored line (cents/thousandths/basis points) to the engine line shape. */
function toEngineLineWire(
  line: StoredLineItem,
): Parameters<typeof calculateDocument>[0][number] {
  return {
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discount:
      line.discount.type === 'none'
        ? { type: 'none' as const }
        : line.discount.type === 'percent'
          ? { type: 'percent' as const, value: line.discount.value }
          : { type: 'fixed' as const, value: line.discount.value },
    taxPercent: line.taxPercent,
  };
}
