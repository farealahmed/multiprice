import { describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { pdfSampleLines, pdfSampleExpected } from '../../test/fixtures/pdf-sample.ts';
import { toEngineLine, fromEngineResult } from './pricing-preview.ts';
import type { DocumentsRepository } from '../persistence/documents.repository.ts';
import type { StoredDocument, StoredLineItem } from '../domain/document.ts';
import type { LineItemInput } from '../contracts/document.ts';

/**
 * Unit tests for services/documents.ts -- recompute-and-persist.
 *
 * Pattern: fake repository (services/auth.test.ts), direct service calls.
 * All arithmetic is delegated to the pricing engine via the existing
 * `toEngineLine`/`fromEngineResult` helpers -- this file tests the
 * orchestration, id management, and response mapping only.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CreateInput = Parameters<DocumentsRepository['insert']>[1];
type UpdateInput = Parameters<DocumentsRepository['update']>[2];

function makeStoredTotals(): StoredDocument['totals'] {
  return { subtotal: 0, totalDiscount: 0, totalTax: 0, grandTotal: 0 };
}

function makeStoredDocument(overrides: Partial<StoredDocument> = {}): StoredDocument {
  return {
    _id: new ObjectId(),
    ownerId: 'owner-1',
    title: 'Test Document',
    customer: 'Acme Corp',
    issueDate: '2026-01-15',
    status: 'draft',
    lines: [],
    totals: makeStoredTotals(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** A 3-line stored document using the PDF sample lines (in stored scale). */
function makeThreeLineDocument(overrides: Partial<StoredDocument> = {}): StoredDocument {
  return makeStoredDocument({
    lines: [
      { id: 'line-a', description: 'Widget A', quantity: 2000, unitPrice: 10000, discount: { type: 'percent', value: 1000 }, taxPercent: 500 },
      { id: 'line-b', description: 'Widget B', quantity: 1000, unitPrice: 5000, discount: { type: 'none' }, taxPercent: 500 },
      { id: 'line-c', description: 'Service fee', quantity: 1000, unitPrice: 20000, discount: { type: 'fixed', value: 2000 }, taxPercent: null },
    ],
    totals: { subtotal: 45000, totalDiscount: 4000, totalTax: 1150, grandTotal: 42150 },
    ...overrides,
  });
}

function makeFakeRepo() {
  const docs = new Map<string, StoredDocument>();

  const repository: DocumentsRepository = {
    list: vi.fn(async () => [...docs.values()]),
    findById: vi.fn(async (ownerId: string, id: string) => {
      try {
        const oid = new ObjectId(id);
        return docs.get(oid.toHexString()) ?? null;
      } catch {
        return null;
      }
    }),
    insert: vi.fn(async (_ownerId: string, doc: CreateInput) => {
      const _id = new ObjectId();
      const stored: StoredDocument = Object.assign({}, doc, { _id, ownerId: _ownerId }) as StoredDocument;
      docs.set(_id.toHexString(), stored);
      return { insertedId: _id };
    }),
    update: vi.fn(async (_ownerId: string, _id: string, _patch: UpdateInput | undefined) => {
      const key = new ObjectId(_id).toHexString();
      const existing = docs.get(key);
      if (!existing) return null;
      const updated = { ...existing, ..._patch, updatedAt: new Date() } as StoredDocument;
      docs.set(key, updated);
      return updated;
    }),
    remove: vi.fn(async (_ownerId: string, id: string) => {
      const oid = new ObjectId(id);
      const key = oid.toHexString();
      const existing = docs.get(key);
      if (!existing) return null;
      docs.delete(key);
      return existing;
    }),
    finalizeIfDraft: vi.fn(async () => null),
  };

  return { repository, docs };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { recomputeAndPersist, toDocumentResponse } from './documents.ts';

// ---------------------------------------------------------------------------
// Recompute on write
// ---------------------------------------------------------------------------

describe('recompute on write', () => {
  it('recomputes totals from the full lines array on create', async () => {
    const { repository } = makeFakeRepo();

    await recomputeAndPersist({
      ownerId: 'owner-1',
      repository,
      metadata: { title: 'Test', customer: 'Acme', issueDate: '2026-01-15' },
      lines: pdfSampleLines as LineItemInput[],
    });

    const insertCall = (repository.insert as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const stored: CreateInput = insertCall[1];
    expect(stored.totals.subtotal).toBe(45000);      // 450.00 in cents
    expect(stored.totals.totalDiscount).toBe(4000);  // 40.00 in cents
    expect(stored.totals.totalTax).toBe(1150);       // 11.50 in cents
    expect(stored.totals.grandTotal).toBe(42150);   // 421.50 in cents
  });

  it('recomputes totals on every update, not just create', async () => {
    const { repository, docs } = makeFakeRepo();
    const existing = makeThreeLineDocument({ ownerId: 'owner-1' });
    docs.set(existing._id.toHexString(), existing);

    // line-a: qty=5, price=100, 10% off, 5% tax -> subtotal=500, discount=50, after=450, tax=22.50
    // line-b: qty=1, price=50, no discount, 5% tax -> subtotal=50, discount=0, after=50, tax=2.50
    // line-c: qty=1, price=200, $20 fixed, no tax -> subtotal=200, discount=20, after=180, tax=0
    // totals: subtotal=750, discount=70, tax=25, total=705
    const updatedLines: LineItemInput[] = [
      { id: 'line-a', description: 'Widget A updated', quantity: 5, unitPrice: 100.0, discount: { type: 'percent', value: 10 }, taxPercent: 5 },
      { id: 'line-b', description: 'Widget B', quantity: 1, unitPrice: 50.0, discount: { type: 'none' }, taxPercent: 5 },
      { id: 'line-c', description: 'Service fee', quantity: 1, unitPrice: 200.0, discount: { type: 'fixed', value: 20.0 }, taxPercent: null },
    ];

    await recomputeAndPersist({
      ownerId: 'owner-1',
      id: existing._id.toHexString(),
      repository,
      metadata: { title: 'Updated', customer: 'Acme', issueDate: '2026-01-15' },
      lines: updatedLines,
    });

    const stored = docs.get(existing._id.toHexString())!;
    expect(stored.totals.subtotal).toBe(75000);
    expect(stored.totals.totalDiscount).toBe(7000);
    expect(stored.totals.totalTax).toBe(2500);
    expect(stored.totals.grandTotal).toBe(70500);
  });
});

// ---------------------------------------------------------------------------
// Line identity
// ---------------------------------------------------------------------------

describe('line identity', () => {
  it('preserves an echoed line id', async () => {
    const { repository } = makeFakeRepo();

    const lines: LineItemInput[] = [
      { id: 'my-custom-id', description: 'Widget A', quantity: 2, unitPrice: 100.0, discount: { type: 'percent', value: 10 }, taxPercent: 5 },
    ];

    await recomputeAndPersist({
      ownerId: 'owner-1',
      repository,
      metadata: { title: 'Test', customer: 'Acme', issueDate: '2026-01-15' },
      lines,
    });

    const insertCall = (repository.insert as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const stored: CreateInput = insertCall[1];
    expect(stored.lines[0]!.id).toBe('my-custom-id');
  });

  it('mints an id for a line with no id', async () => {
    const { repository } = makeFakeRepo();

    const lines: LineItemInput[] = [
      { description: 'Widget A', quantity: 2, unitPrice: 100.0, discount: { type: 'percent', value: 10 }, taxPercent: 5 },
    ];

    await recomputeAndPersist({
      ownerId: 'owner-1',
      repository,
      metadata: { title: 'Test', customer: 'Acme', issueDate: '2026-01-15' },
      lines,
    });

    const insertCall = (repository.insert as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const stored: CreateInput = insertCall[1];
    expect(stored.lines[0]!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('editing one line leaves others ids unchanged', async () => {
    const { repository, docs } = makeFakeRepo();
    const existing = makeThreeLineDocument({ ownerId: 'owner-1' });
    docs.set(existing._id.toHexString(), existing);

    const originalLineB = existing.lines.find((l) => l.id === 'line-b')!;
    const originalLineC = existing.lines.find((l) => l.id === 'line-c')!;

    // Update only line-a
    const updatedLines: LineItemInput[] = [
      { id: 'line-a', description: 'Widget A updated', quantity: 5, unitPrice: 100.0, discount: { type: 'percent', value: 10 }, taxPercent: 5 },
      { id: 'line-b', description: 'Widget B', quantity: 1, unitPrice: 50.0, discount: { type: 'none' }, taxPercent: 5 },
      { id: 'line-c', description: 'Service fee', quantity: 1, unitPrice: 200.0, discount: { type: 'fixed', value: 20.0 }, taxPercent: null },
    ];

    await recomputeAndPersist({
      ownerId: 'owner-1',
      id: existing._id.toHexString(),
      repository,
      metadata: { title: 'Updated', customer: 'Acme', issueDate: '2026-01-15' },
      lines: updatedLines,
    });

    const stored = docs.get(existing._id.toHexString())!;
    expect(stored.lines.find((l) => l.id === 'line-b')!.id).toBe(originalLineB.id);
    expect(stored.lines.find((l) => l.id === 'line-c')!.id).toBe(originalLineC.id);
  });
});

// ---------------------------------------------------------------------------
// Error propagation
// ---------------------------------------------------------------------------

describe('error propagation', () => {
  it('engine rejection throws PricingPreviewError with DISCOUNT_EXCEEDS_SUBTOTAL', async () => {
    const { repository } = makeFakeRepo();

    // Fixed discount of 500 on a line with subtotal of 200 (quantity 2 * unitPrice 100)
    const badLines: LineItemInput[] = [
      { description: 'Widget A', quantity: 2, unitPrice: 100.0, discount: { type: 'fixed', value: 500.0 }, taxPercent: null },
    ];

    await expect(
      recomputeAndPersist({
        ownerId: 'owner-1',
        repository,
        metadata: { title: 'Test', customer: 'Acme', issueDate: '2026-01-15' },
        lines: badLines,
      }),
    ).rejects.toMatchObject({
      name: 'PricingPreviewError',
      cause: expect.objectContaining({ code: 'DISCOUNT_EXCEEDS_SUBTOTAL' }),
      lineIndex: 0,
    });
  });

  it('missing document id throws DOCUMENT_NOT_FOUND on update', async () => {
    const { repository } = makeFakeRepo();

    await expect(
      recomputeAndPersist({
        ownerId: 'owner-1',
        id: new ObjectId().toHexString(),
        repository,
        metadata: { title: 'Test', customer: 'Acme', issueDate: '2026-01-15' },
        lines: [],
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
  });

  it('missing document id throws DOCUMENT_NOT_FOUND on remove', async () => {
    const { repository } = makeFakeRepo();

    await expect(
      recomputeAndPersist({
        ownerId: 'owner-1',
        id: new ObjectId().toHexString(),
        repository,
        action: 'remove',
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

describe('response shape', () => {
  it('response LineItem carries no computed fields', async () => {
    const { repository } = makeFakeRepo();

    const result = await recomputeAndPersist({
      ownerId: 'owner-1',
      repository,
      metadata: { title: 'Test', customer: 'Acme', issueDate: '2026-01-15' },
      lines: pdfSampleLines as LineItemInput[],
    });

    for (const line of result.lines) {
      expect(Object.keys(line).sort()).toEqual(
        ['id', 'description', 'quantity', 'unitPrice', 'discount', 'taxPercent'].sort(),
      );
    }
  });

  it('ownerId never appears in the response', async () => {
    const { repository } = makeFakeRepo();

    const result = await recomputeAndPersist({
      ownerId: 'owner-1',
      repository,
      metadata: { title: 'Test', customer: 'Acme', issueDate: '2026-01-15' },
      lines: [],
    });

    expect('ownerId' in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Regression guard -- ensure toEngineLine/fromEngineResult produce the same
// values as the pricing-preview route-level tests already assert
// ---------------------------------------------------------------------------

describe('regression guard -- matches pricing-preview.test.ts pinned values', () => {
  it('toEngineLine + fromEngineResult for PDF fixture produces expected per-line figures', () => {
    const engineLines = pdfSampleLines.map(toEngineLine);
    const { calculateDocument } = require('../pricing/index.ts');
    const result = fromEngineResult(calculateDocument(engineLines));

    expect(result.subtotal).toBe(pdfSampleExpected.subtotal);
    expect(result.totalDiscount).toBe(pdfSampleExpected.totalDiscount);
    expect(result.totalTax).toBe(pdfSampleExpected.totalTax);
    expect(result.grandTotal).toBe(pdfSampleExpected.grandTotal);

    result.lines.forEach((line: { subtotal: number; discountAmount: number; afterDiscount: number; taxAmount: number; total: number }, i: number) => {
      expect(line.subtotal).toBe(pdfSampleExpected.lines[i]!.subtotal);
      expect(line.discountAmount).toBe(pdfSampleExpected.lines[i]!.discountAmount);
      expect(line.afterDiscount).toBe(pdfSampleExpected.lines[i]!.afterDiscount);
      expect(line.taxAmount).toBe(pdfSampleExpected.lines[i]!.taxAmount);
      expect(line.total).toBe(pdfSampleExpected.lines[i]!.total);
    });
  });
});
