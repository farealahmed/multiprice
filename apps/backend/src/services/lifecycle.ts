import { calculateDocument } from '../pricing/index.ts';
import type { PricingError } from '../pricing/index.ts';
import type { DocumentsRepository } from '../persistence/documents.repository.ts';
import type { StoredLineItem, StoredTotals } from '../domain/document.ts';
import type { DocumentResponse } from '../contracts/document.ts';
import { DOCUMENT_HAS_NO_LINES } from '../contracts/lifecycle.ts';
import {
  DocumentNotFoundError,
  DocumentAlreadyFinalizedError,
  toDocumentResponse,
} from './documents.ts';
import {
  findFailingLine,
  PricingPreviewError,
} from './pricing-preview.ts';

/** Re-exported so existing importers (routes, tests) keep working unchanged;
 *  `documents.ts` is the single definition, since `updateDocument`/`removeDocument`
 *  can now throw it too. */
export { DocumentAlreadyFinalizedError } from './documents.ts';

/** Thrown when an attempt is made to finalize a document that has no line items. */
export class DocumentHasNoLinesError extends Error {
  readonly code: typeof DOCUMENT_HAS_NO_LINES = DOCUMENT_HAS_NO_LINES;

  constructor() {
    super('Document has no lines');
    this.name = 'DocumentHasNoLinesError';
  }
}

/** Bounds the compare-and-set retry below: each retry only happens when a
 *  concurrent draft mutation (not a finalize) changed the document between
 *  validation and the atomic write, so unbounded contention is not expected. */
const MAX_FINALIZE_ATTEMPTS = 5;

/**
 * Finalizes a draft document after checking preconditions.
 *
 * Preconditions (in order):
 *  1. The document exists and is owned by the caller.
 *  2. The document has at least one line item.
 *  3. The persisted lines still pass the pricing engine (defensive validation only).
 *
 * The atomic `finalizeIfDraft` write is a compare-and-set on `updatedAt`: it
 * only commits if the document is still the exact revision that was just
 * validated and recomputed here, so it persists the freshly computed totals
 * alongside `status: 'finalized'`. A concurrent finalize loses the race and
 * surfaces `DocumentAlreadyFinalizedError`. A concurrent *draft* mutation also
 * changes `updatedAt`, but the document is still a draft — that case is
 * retried against the fresh revision rather than reported as a conflict.
 */
export async function finalizeDocument(params: {
  ownerId: string;
  repository: DocumentsRepository;
  id: string;
}): Promise<DocumentResponse> {
  const { ownerId, repository, id } = params;

  for (let attempt = 0; attempt < MAX_FINALIZE_ATTEMPTS; attempt++) {
    const stored = await repository.findById(ownerId, id);
    if (!stored) {
      throw new DocumentNotFoundError();
    }

    if (stored.lines.length === 0) {
      throw new DocumentHasNoLinesError();
    }

    const engineLines = stored.lines.map(toEngineLineWire);
    let totals: StoredTotals;
    try {
      const engineResult = calculateDocument(engineLines);
      totals = {
        subtotal: engineResult.subtotal,
        totalDiscount: engineResult.totalDiscount,
        totalTax: engineResult.totalTax,
        grandTotal: engineResult.grandTotal,
      };
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

    const finalized = await repository.finalizeIfDraft(ownerId, id, stored.updatedAt, totals);
    if (finalized) {
      return toDocumentResponse(finalized);
    }

    // Lost the race — find out whether it was against a finalize (conflict) or
    // a draft mutation (retry against the fresh revision).
    const current = await repository.findById(ownerId, id);
    if (!current) {
      throw new DocumentNotFoundError();
    }
    if (current.status === 'finalized') {
      throw new DocumentAlreadyFinalizedError();
    }
    // current.status === 'draft' with a different updatedAt: a concurrent
    // edit changed the document underneath us. Loop and revalidate it fresh.
  }

  throw new DocumentAlreadyFinalizedError();
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
