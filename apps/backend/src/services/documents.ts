import { randomUUID } from 'crypto';

import { calculateDocument } from '../pricing/index.ts';
import type { PricingError } from '../pricing/index.ts';
import {
  toEngineLine,
  findFailingLine,
  PricingPreviewError,
} from './pricing-preview.ts';
import type { DocumentsRepository } from '../persistence/documents.repository.ts';
import type {
  StoredDocument,
  StoredLineItem,
  StoredTotals,
  StoredDiscount,
} from '../domain/document.ts';
import type {
  DocumentResponse,
  LineItemInput,
  LineItemResponse,
  DocumentTotals,
  CreateDocumentInput,
  UpdateDocumentInput,
} from '../contracts/document.ts';
import { DOCUMENT_NOT_FOUND } from '../contracts/document.ts';
import { DOCUMENT_FINALIZED } from '../contracts/lifecycle.ts';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Wire representation of a line item in a create/update request. */
export type { LineItemInput } from '../contracts/document.ts';

/** Persisted totals in cents -- stored and returned identically. */
export type { StoredTotals } from '../domain/document.ts';

/** Domain error thrown when a document doesn't exist or isn't owned by the caller. */
export class DocumentNotFoundError extends Error {
  readonly code: typeof DOCUMENT_NOT_FOUND = DOCUMENT_NOT_FOUND;
  constructor() {
    super('Document not found');
    this.name = 'DocumentNotFoundError';
  }
}

/**
 * Domain error thrown when a conditional draft-only write (update, remove, or
 * finalize) loses its race against a concurrent finalization: the document
 * exists and is owned by the caller, but is no longer a draft.
 */
export class DocumentAlreadyFinalizedError extends Error {
  readonly code: typeof DOCUMENT_FINALIZED = DOCUMENT_FINALIZED;
  constructor() {
    super('Document is already finalized');
    this.name = 'DocumentAlreadyFinalizedError';
  }
}

// ---------------------------------------------------------------------------
// Request shapes (internal)
// ---------------------------------------------------------------------------

interface BaseParams {
  ownerId: string;
  repository: DocumentsRepository;
}

interface CreateParams extends BaseParams {
  metadata: Pick<CreateDocumentInput, 'title' | 'customer' | 'issueDate'>;
  lines: LineItemInput[];
}

interface UpdateParams extends BaseParams {
  id: string;
  metadata?: Partial<Pick<UpdateDocumentInput, 'title' | 'customer' | 'issueDate'>>;
  lines?: LineItemInput[];
}

interface RemoveParams extends BaseParams {
  id: string;
}

/** Discriminated union -- 'op' is the discriminant. */
type ServiceParams =
  | (BaseParams & { op: 'create'; metadata: CreateParams['metadata']; lines: LineItemInput[] })
  | (BaseParams & { op: 'update'; id: string; metadata?: UpdateParams['metadata']; lines?: LineItemInput[] })
  | (BaseParams & { op: 'remove'; id: string });

// ---------------------------------------------------------------------------
// Response mapping  (R2 -- StoredDocument -> DocumentResponse)
// ---------------------------------------------------------------------------

/** Converts a stored-discount object to its wire response shape. */
function toDiscountResponse(discount: StoredDiscount): LineItemResponse['discount'] {
  if (discount.type === 'none') return { type: 'none' };
  if (discount.type === 'percent') return { type: 'percent', value: discount.value / 100 };
  return { type: 'fixed', value: discount.value / 100 };
}

/** Maps a stored line item to the wire response (major units, no computed fields). */
function toLineResponse(line: StoredLineItem): LineItemResponse {
  return {
    id: line.id,
    description: line.description,
    quantity: line.quantity / 1000,
    unitPrice: line.unitPrice / 100,
    discount: toDiscountResponse(line.discount),
    taxPercent: line.taxPercent == null ? null : line.taxPercent / 100,
  };
}

/** Maps stored totals (cents) to the wire response (major units). */
function toTotalsResponse(totals: StoredTotals): DocumentTotals {
  return {
    subtotal: totals.subtotal / 100,
    totalDiscount: totals.totalDiscount / 100,
    totalTax: totals.totalTax / 100,
    grandTotal: totals.grandTotal / 100,
  };
}

/** Maps a persisted StoredDocument to the wire DocumentResponse.
 *  R2: one mapper at the repository/service boundary.
 *  R30: LineItem carries no computed fields. */
export function toDocumentResponse(stored: StoredDocument): DocumentResponse {
  return {
    id: stored._id.toHexString(),
    title: stored.title,
    customer: stored.customer,
    issueDate: stored.issueDate,
    status: stored.status,
    lines: stored.lines.map(toLineResponse),
    totals: toTotalsResponse(stored.totals),
    createdAt: stored.createdAt.toISOString(),
    updatedAt: stored.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Discount conversion helpers  (reuse from pricing-preview.ts)
// ---------------------------------------------------------------------------

/** Converts a wire discount to the stored scale (basis points / cents). */
function toStoredDiscount(discount: LineItemInput['discount']): StoredDiscount {
  if (discount.type === 'none') return { type: 'none' };
  if (discount.type === 'percent')
    return { type: 'percent', value: Math.round(discount.value * 100) };
  return { type: 'fixed', value: Math.round(discount.value * 100) };
}

/** Converts a wire line item to a stored StoredLineItem, minting an id if absent. */
function toStoredLine(id: string | undefined, line: LineItemInput): StoredLineItem {
  return {
    id: id ?? randomUUID(),
    description: line.description,
    quantity: Math.round(line.quantity * 1000),
    unitPrice: Math.round(line.unitPrice * 100),
    discount: toStoredDiscount(line.discount),
    taxPercent: line.taxPercent == null ? null : Math.round(line.taxPercent * 100),
  };
}

// ---------------------------------------------------------------------------
// Core write path
// ---------------------------------------------------------------------------

/**
 * Central write path for all five mutating routes (ARCH decision A8).
 *
 * All three operations funnel through this internal function. It always:
 *  1. Validates document existence (update / remove)
 *  2. Converts wire line inputs -> engine scale
 *  3. Runs the full `calculateDocument` over all lines
 *  4. Persists the document with server-computed totals (client totals are NEVER trusted)
 *  5. Maps the stored document back to a DocumentResponse (major units)
 *
 * Domain errors (`DOCUMENT_NOT_FOUND`) and engine errors (`PricingPreviewError`)
 * are thrown here, not in the routes (ARCH decision A3).
 */
async function recomputeAndPersistInternal(params: ServiceParams): Promise<DocumentResponse> {
  const { ownerId, repository, op } = params;

  // ---- Remove path ------------------------------------------------------------
  // Conditional delete (status: 'draft' in the filter) closes the TOCTOU window
  // between checking existence and deleting: a concurrent finalize can no longer
  // slip a delete through after flipping the document to finalized.
  if (op === 'remove') {
    const removed = await repository.remove(ownerId, params.id);
    if (!removed) {
      const stillExists = await repository.findById(ownerId, params.id);
      if (!stillExists) throw new DocumentNotFoundError();
      throw new DocumentAlreadyFinalizedError();
    }
    return toDocumentResponse(removed);
  }

  // ---- Load existing document for update ----------------------------------------
  let existing: StoredDocument | null = null;
  let storedLines: StoredLineItem[] = [];

  if (op === 'update') {
    existing = await repository.findById(ownerId, params.id);
    if (!existing) throw new DocumentNotFoundError();
    storedLines = params.lines
      ? params.lines.map((l) => toStoredLine(l.id, l))
      : existing.lines;
  } else {
    storedLines = params.lines.map((l) => toStoredLine(l.id, l));
  }

  // ---- Run engine -- full recompute on every write (ARCH decision A8) --------
  const engineLines = storedLines.map(toEngineLineWire);
  let engineResult: ReturnType<typeof calculateDocument>;
  try {
    engineResult = calculateDocument(engineLines);
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      const pricingError = error as PricingError;
      throw new PricingPreviewError(pricingError, findFailingLine(engineLines, pricingError.code));
    }
    throw error;
  }

  const totals: StoredTotals = {
    subtotal: engineResult.subtotal,
    totalDiscount: engineResult.totalDiscount,
    totalTax: engineResult.totalTax,
    grandTotal: engineResult.grandTotal,
  };

  // ---- Persist ----------------------------------------------------------------
  const now = new Date();

  if (op === 'create') {
    const { title, customer, issueDate } = params.metadata;
    const doc: Omit<StoredDocument, '_id' | 'ownerId'> = {
      title,
      customer,
      issueDate,
      status: 'draft',
      lines: storedLines,
      totals,
      createdAt: now,
      updatedAt: now,
    };
    const result = await repository.insert(ownerId, doc);
    const inserted: StoredDocument = { _id: result.insertedId, ownerId, ...doc };
    return toDocumentResponse(inserted);
  }

  // op === 'update'
  const patch: Partial<Omit<StoredDocument, '_id' | 'ownerId'>> = { updatedAt: now };
  if (params.metadata) {
    if (params.metadata.title !== undefined) patch.title = params.metadata.title;
    if (params.metadata.customer !== undefined) patch.customer = params.metadata.customer;
    if (params.metadata.issueDate !== undefined) patch.issueDate = params.metadata.issueDate;
  }
  if (params.lines !== undefined) {
    patch.lines = storedLines;
    patch.totals = totals;
  }
  // Conditional update (status: 'draft' in the filter) closes the same TOCTOU
  // window as the remove path above: a concurrent finalize between the read at
  // the top of this function and this write causes the write itself to fail,
  // rather than silently committing a mutation to a document that is now
  // locked.
  const updated = await repository.update(ownerId, params.id, patch);
  if (!updated) {
    const stillExists = await repository.findById(ownerId, params.id);
    if (!stillExists) throw new DocumentNotFoundError();
    throw new DocumentAlreadyFinalizedError();
  }
  return toDocumentResponse(updated);
}

// ---------------------------------------------------------------------------
// Public API (three operations funnel through one internal function)
// ---------------------------------------------------------------------------

/** Create a new document with the given metadata and lines. */
export async function createDocument(params: {
  ownerId: string;
  repository: DocumentsRepository;
  metadata: Pick<CreateDocumentInput, 'title' | 'customer' | 'issueDate'>;
  lines: LineItemInput[];
}): Promise<DocumentResponse> {
  return recomputeAndPersistInternal({ ...params, op: 'create' });
}

/** Update an existing document identified by `id`. */
export async function updateDocument(params: {
  ownerId: string;
  repository: DocumentsRepository;
  id: string;
  metadata?: Partial<Pick<UpdateDocumentInput, 'title' | 'customer' | 'issueDate'>>;
  lines?: LineItemInput[];
}): Promise<DocumentResponse> {
  return recomputeAndPersistInternal({ ...params, op: 'update' });
}

/** Remove a document identified by `id`. Returns the document as it was before removal. */
export async function removeDocument(params: {
  ownerId: string;
  repository: DocumentsRepository;
  id: string;
}): Promise<DocumentResponse> {
  return recomputeAndPersistInternal({ ...params, op: 'remove' });
}

/** Backwards-compatible alias for code that uses the single-function shape.
 *  @deprecated Use createDocument / updateDocument / removeDocument directly. */
export async function recomputeAndPersist(params: {
  ownerId: string;
  repository: DocumentsRepository;
  id?: string;
  action?: 'remove';
  metadata?: CreateDocumentInput | UpdateDocumentInput;
  lines?: LineItemInput[];
}): Promise<DocumentResponse> {
  if (params.action === 'remove' && params.id !== undefined) {
    return removeDocument({ ownerId: params.ownerId, repository: params.repository, id: params.id });
  }
  if (params.id !== undefined) {
    return updateDocument({
      ownerId: params.ownerId,
      repository: params.repository,
      id: params.id,
      metadata: params.metadata as UpdateDocumentInput | undefined,
      lines: params.lines,
    });
  }
  return createDocument({
    ownerId: params.ownerId,
    repository: params.repository,
    metadata: params.metadata as CreateDocumentInput,
    lines: params.lines ?? [],
  });
}

// ---------------------------------------------------------------------------
// Internal helper: StoredLineItem -> EngineLineInput
// ---------------------------------------------------------------------------

/** Converts a stored line (cents/thousandths/basis-points) to an engine line. */
function toEngineLineWire(line: StoredLineItem): Parameters<typeof calculateDocument>[0][number] {
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
