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
import type { StoredDocument, StoredLineItem } from '../domain/document.ts';

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

function createFakeRepository({
  findByIdResult,
  finalizeIfDraftResult,
}: {
  findByIdResult?: StoredDocument | null;
  finalizeIfDraftResult?: StoredDocument | null;
} = {}): {
  repository: DocumentsRepository;
  calls: {
    findById: Array<{ ownerId: string; id: string }>;
    finalizeIfDraft: Array<{ ownerId: string; id: string }>;
  };
} {
  const calls = {
    findById: [] as Array<{ ownerId: string; id: string }>,
    finalizeIfDraft: [] as Array<{ ownerId: string; id: string }>,
  };

  const repository: DocumentsRepository = {
    list: vi.fn(),
    findById: async (ownerId, id) => {
      calls.findById.push({ ownerId, id });
      if (!findByIdResult) return null;
      if (findByIdResult.ownerId !== ownerId) return null;
      return findByIdResult;
    },
    insert: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    finalizeIfDraft: async (ownerId, id) => {
      calls.finalizeIfDraft.push({ ownerId, id });
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

    expect(calls.finalizeIfDraft).toEqual([{ ownerId: OWNER_ID, id }]);
    expect(result.status).toBe('finalized');
    expect(result.id).toBe(id);
  });

  it('reports the stored totals and never recomputes them during the finalize write', async () => {
    const storedTotals = { subtotal: 500, totalDiscount: 0, totalTax: 0, grandTotal: 500 };
    const draft = makeStoredDocument({
      lines: [makeValidLine({ unitPrice: 500 })],
      totals: storedTotals,
    });
    const postImage: StoredDocument = {
      ...draft,
      status: 'finalized',
      updatedAt: new Date(),
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

    expect(result.totals).toEqual({
      subtotal: 5,
      totalDiscount: 0,
      totalTax: 0,
      grandTotal: 5,
    });
  });

  it('throws DocumentAlreadyFinalizedError when finalizeIfDraft loses a concurrent race', async () => {
    const draft = makeStoredDocument();
    const { repository, calls } = createFakeRepository({
      findByIdResult: draft,
      finalizeIfDraftResult: null,
    });
    const id = draft._id.toHexString();

    await expect(
      finalizeDocument({ ownerId: OWNER_ID, repository, id }),
    ).rejects.toBeInstanceOf(DocumentAlreadyFinalizedError);

    expect(calls.finalizeIfDraft).toEqual([{ ownerId: OWNER_ID, id }]);
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
