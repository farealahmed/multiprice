import { describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { randomUUID } from 'crypto';

import { finalizeDocument } from './lifecycle.ts';
import {
  DocumentHasNoLinesError,
  DocumentAlreadyFinalizedError,
} from './lifecycle.ts';
import { DocumentNotFoundError, toDocumentResponse } from './documents.ts';
import { PricingPreviewError } from './pricing-preview.ts';
import type { DocumentsRepository } from '../persistence/documents.repository.ts';
import type { StoredDocument, StoredLineItem, StoredTotals } from '../domain/document.ts';

const OWNER_ID = 'owner-1';
const OTHER_OWNER_ID = 'owner-2';

function makeStoredDocument(overrides: Partial<StoredDocument> = {}): StoredDocument {
  const _id = overrides._id ?? new ObjectId();
  return {
    _id,
    ownerId: OWNER_ID,
    title: 'Invoice',
    customer: 'Acme',
    issueDate: '2026-08-13',
    status: 'draft',
    lines: [makeValidLine()],
    totals: { subtotal: 100, totalDiscount: 0, totalTax: 0, grandTotal: 100 },
    createdAt: new Date('2026-08-13T00:00:00.000Z'),
    updatedAt: new Date('2026-08-13T00:00:00.000Z'),
    ...overrides,
  };
}

function makeValidLine(overrides: Partial<StoredLineItem> = {}): StoredLineItem {
  return {
    id: randomUUID(),
    description: 'Service',
    quantity: 1000,
    unitPrice: 100,
    discount: { type: 'none' },
    taxPercent: null,
    ...overrides,
  };
}

type FinalizeIfDraftCall = {
  ownerId: string;
  id: string;
  expectedUpdatedAt: Date;
  totals: StoredTotals;
};

function createFakeRepository({
  findByIdResult,
  findByIdSequence,
  finalizeIfDraftResult,
  finalizeIfDraftSequence,
}: {
  findByIdResult?: StoredDocument | null;
  findByIdSequence?: Array<StoredDocument | null>;
  finalizeIfDraftResult?: StoredDocument | null;
  finalizeIfDraftSequence?: Array<StoredDocument | null>;
} = {}): {
  repository: DocumentsRepository;
  calls: {
    findById: Array<{ ownerId: string; id: string }>;
    finalizeIfDraft: FinalizeIfDraftCall[];
  };
} {
  const calls = {
    findById: [] as Array<{ ownerId: string; id: string }>,
    finalizeIfDraft: [] as FinalizeIfDraftCall[],
  };

  const findByIdQueue = findByIdSequence ? [...findByIdSequence] : undefined;
  const finalizeQueue = finalizeIfDraftSequence ? [...finalizeIfDraftSequence] : undefined;

  const repository: DocumentsRepository = {
    list: vi.fn(),
    findById: async (ownerId, id) => {
      calls.findById.push({ ownerId, id });
      if (findByIdQueue) {
        return findByIdQueue.length > 0 ? findByIdQueue.shift()! : null;
      }
      if (!findByIdResult) return null;
      if (findByIdResult.ownerId !== ownerId) return null;
      return findByIdResult;
    },
    insert: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    finalizeIfDraft: async (ownerId, id, expectedUpdatedAt, totals) => {
      calls.finalizeIfDraft.push({ ownerId, id, expectedUpdatedAt, totals });
      if (finalizeQueue) {
        return finalizeQueue.length > 0 ? finalizeQueue.shift()! : null;
      }
      return finalizeIfDraftResult ?? null;
    },
  };

  return { repository, calls };
}

describe('lifecycle service — finalizeDocument', () => {
  it('throws DocumentNotFoundError for a missing document and never calls finalizeIfDraft', async () => {
    const { repository, calls } = createFakeRepository({ findByIdResult: null });
    const id = new ObjectId().toHexString();

    await expect(
      finalizeDocument({ ownerId: OWNER_ID, repository, id }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);

    expect(calls.findById).toEqual([{ ownerId: OWNER_ID, id }]);
    expect(calls.finalizeIfDraft).toHaveLength(0);
  });

  it('throws DocumentNotFoundError for a foreign-owned document', async () => {
    const foreign = makeStoredDocument({ ownerId: OTHER_OWNER_ID });
    const { repository, calls } = createFakeRepository({ findByIdResult: foreign });
    const id = foreign._id.toHexString();

    await expect(
      finalizeDocument({ ownerId: OWNER_ID, repository, id }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);

    expect(calls.finalizeIfDraft).toHaveLength(0);
  });

  it('throws DocumentHasNoLinesError before any recompute for an empty document', async () => {
    const empty = makeStoredDocument({ lines: [] });
    const { repository, calls } = createFakeRepository({ findByIdResult: empty });
    const id = empty._id.toHexString();

    await expect(
      finalizeDocument({ ownerId: OWNER_ID, repository, id }),
    ).rejects.toBeInstanceOf(DocumentHasNoLinesError);

    expect(calls.findById).toHaveLength(1);
    expect(calls.finalizeIfDraft).toHaveLength(0);
  });

  it('rejects invalid persisted lines with a PricingPreviewError and never calls finalizeIfDraft', async () => {
    const invalidLine = makeValidLine({
      discount: { type: 'fixed', value: 200 },
    });
    const invalid = makeStoredDocument({ lines: [invalidLine] });
    const { repository, calls } = createFakeRepository({ findByIdResult: invalid });
    const id = invalid._id.toHexString();

    await expect(
      finalizeDocument({ ownerId: OWNER_ID, repository, id }),
    ).rejects.toBeInstanceOf(PricingPreviewError);

    await expect(
      finalizeDocument({ ownerId: OWNER_ID, repository, id }),
    ).rejects.toMatchObject({
      lineIndex: 0,
      cause: { code: 'DISCOUNT_EXCEEDS_SUBTOTAL' },
    });

    expect(calls.findById).toHaveLength(2);
    expect(calls.finalizeIfDraft).toHaveLength(0);
  });

  it('flips status via the atomic write and returns a finalized DocumentResponse', async () => {
    const draft = makeStoredDocument();
    const postImage: StoredDocument = {
      ...draft,
      status: 'finalized',
      updatedAt: new Date('2026-08-13T12:00:00.000Z'),
    };
    const { repository, calls } = createFakeRepository({
      findByIdResult: draft,
      finalizeIfDraftResult: postImage,
    });
    const id = draft._id.toHexString();

    const result = await finalizeDocument({ ownerId: OWNER_ID, repository, id });

    expect(calls.finalizeIfDraft).toMatchObject([{ ownerId: OWNER_ID, id }]);
    expect(result.status).toBe('finalized');
    expect(result.id).toBe(id);
  });

  it('persists freshly recomputed totals in the finalize write, overwriting a stale stored total', async () => {
    // Stored totals are deliberately stale (as if the line was edited without
    // a save reaching this total) so the recomputed value can be told apart
    // from a value that was merely passed through unchanged.
    const staleTotals = { subtotal: 999_99, totalDiscount: 0, totalTax: 0, grandTotal: 999_99 };
    const recomputedTotals = { subtotal: 500, totalDiscount: 0, totalTax: 0, grandTotal: 500 };
    const draft = makeStoredDocument({
      lines: [makeValidLine({ unitPrice: 500 })],
      totals: staleTotals,
    });
    const postImage: StoredDocument = {
      ...draft,
      status: 'finalized',
      totals: recomputedTotals,
      updatedAt: new Date(),
    };
    const { repository, calls } = createFakeRepository({
      findByIdResult: draft,
      finalizeIfDraftResult: postImage,
    });

    const result = await finalizeDocument({
      ownerId: OWNER_ID,
      repository,
      id: draft._id.toHexString(),
    });

    expect(calls.finalizeIfDraft[0]!.totals).toEqual(recomputedTotals);
    expect(result.totals).toEqual({
      subtotal: 5,
      totalDiscount: 0,
      totalTax: 0,
      grandTotal: 5,
    });
  });

  it('throws DocumentAlreadyFinalizedError when finalizeIfDraft loses a race against a concurrent finalize', async () => {
    const draft = makeStoredDocument();
    const alreadyFinalized: StoredDocument = { ...draft, status: 'finalized' };
    const { repository, calls } = createFakeRepository({
      findByIdSequence: [draft, alreadyFinalized],
      finalizeIfDraftResult: null,
    });
    const id = draft._id.toHexString();

    await expect(
      finalizeDocument({ ownerId: OWNER_ID, repository, id }),
    ).rejects.toBeInstanceOf(DocumentAlreadyFinalizedError);

    // One validation read, one atomic-write attempt, one recheck read — no retry,
    // since the recheck confirms the document is genuinely finalized.
    expect(calls.findById).toHaveLength(2);
    expect(calls.finalizeIfDraft).toHaveLength(1);
  });

  it('retries against the fresh revision when a concurrent draft mutation (not a finalize) changed updatedAt', async () => {
    const v1 = makeStoredDocument({
      lines: [makeValidLine({ unitPrice: 100 })],
      totals: { subtotal: 100, totalDiscount: 0, totalTax: 0, grandTotal: 100 },
    });
    const v2: StoredDocument = {
      ...v1,
      lines: [makeValidLine({ unitPrice: 300 })],
      totals: { subtotal: 300, totalDiscount: 0, totalTax: 0, grandTotal: 300 },
      updatedAt: new Date('2026-08-13T01:00:00.000Z'),
    };
    const postImage: StoredDocument = { ...v2, status: 'finalized' };

    const { repository, calls } = createFakeRepository({
      // Validation read for attempt 1, recheck read after the lost race,
      // validation read for attempt 2.
      findByIdSequence: [v1, v2, v2],
      finalizeIfDraftSequence: [null, postImage],
    });

    const result = await finalizeDocument({
      ownerId: OWNER_ID,
      repository,
      id: v1._id.toHexString(),
    });

    expect(calls.finalizeIfDraft).toHaveLength(2);
    expect(calls.finalizeIfDraft[0]!.expectedUpdatedAt).toEqual(v1.updatedAt);
    expect(calls.finalizeIfDraft[0]!.totals).toEqual({ subtotal: 100, totalDiscount: 0, totalTax: 0, grandTotal: 100 });
    expect(calls.finalizeIfDraft[1]!.expectedUpdatedAt).toEqual(v2.updatedAt);
    expect(calls.finalizeIfDraft[1]!.totals).toEqual({ subtotal: 300, totalDiscount: 0, totalTax: 0, grandTotal: 300 });
    expect(result.status).toBe('finalized');
  });

  it('maps the post-image with the same toDocumentResponse used by the documents service', async () => {
    const draft = makeStoredDocument();
    const postImage: StoredDocument = {
      ...draft,
      status: 'finalized',
      updatedAt: new Date('2026-08-13T12:00:00.000Z'),
    };
    const { repository } = createFakeRepository({
      findByIdResult: draft,
      finalizeIfDraftResult: postImage,
    });

    const result = await finalizeDocument({
      ownerId: OWNER_ID,
      repository,
      id: draft._id.toHexString(),
    });

    expect(result).toEqual(toDocumentResponse(postImage));
  });
});
