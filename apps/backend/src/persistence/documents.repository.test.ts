import { describe, expect, it } from 'vitest';
import { ObjectId, type Collection, type Db, type Filter, type Sort, type UpdateFilter } from 'mongodb';
import type { ReturnDocument } from 'mongodb';
import type { StoredDocument } from '../domain/document.ts';
import { createDocumentsRepository } from './documents.repository.ts';

function createFakeCollection() {
  const findOneFilters: Filter<StoredDocument>[] = [];
  const findFilters: Filter<StoredDocument>[] = [];
  const findSorts: Sort[] = [];
  const insertedDocuments: StoredDocument[] = [];
  const updateCalls: Array<{ filter: Filter<StoredDocument>; update: UpdateFilter<StoredDocument> }> = [];
  const deleteFilters: Filter<StoredDocument>[] = [];

  const findOneAndUpdateResults: Array<StoredDocument | null> = [];
  let findOneAndUpdateImpl: ((
    filter: Filter<StoredDocument>,
    update: UpdateFilter<StoredDocument>,
    opts?: { returnDocument?: ReturnDocument },
  ) => Promise<StoredDocument | null>) | undefined;

  const findOneAndDeleteResults: Array<StoredDocument | null> = [];
  let findOneAndDeleteImpl: ((filter: Filter<StoredDocument>) => Promise<StoredDocument | null>) | undefined;

  const createCursor = () => ({
    sort: (sortSpec: Sort) => {
      findSorts.push(sortSpec);
      return { toArray: async () => [] };
    },
  });

  const collection = {
    findOne: async (filter: Filter<StoredDocument>) => {
      findOneFilters.push(filter);
      return null;
    },
    find: (filter: Filter<StoredDocument>) => {
      findFilters.push(filter);
      return createCursor();
    },
    insertOne: async (document: StoredDocument) => {
      insertedDocuments.push(document);
      return { acknowledged: true, insertedId: new ObjectId() };
    },
    updateOne: async (filter: Filter<StoredDocument>, update: UpdateFilter<StoredDocument>) => {
      updateCalls.push({ filter, update });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    },
    deleteOne: async (filter: Filter<StoredDocument>) => {
      deleteFilters.push(filter);
      return { acknowledged: true, deletedCount: 1 };
    },
    findOneAndUpdate: async (
      filter: Filter<StoredDocument>,
      update: UpdateFilter<StoredDocument>,
      opts?: { returnDocument?: ReturnDocument },
    ) => {
      updateCalls.push({ filter, update });
      if (findOneAndUpdateImpl) {
        return findOneAndUpdateImpl(filter, update, opts);
      }
      return findOneAndUpdateResults.shift() ?? null;
    },
    findOneAndDelete: async (filter: Filter<StoredDocument>) => {
      deleteFilters.push(filter);
      if (findOneAndDeleteImpl) {
        return findOneAndDeleteImpl(filter);
      }
      return findOneAndDeleteResults.shift() ?? null;
    },
  } as unknown as Collection<StoredDocument>;

  return {
    collection,
    findOneFilters,
    findFilters,
    findSorts,
    insertedDocuments,
    updateCalls,
    deleteFilters,
    findOneAndUpdateResults,
    findOneAndDeleteResults,
    setFindOneAndUpdateImpl(
      fn: (
        filter: Filter<StoredDocument>,
        update: UpdateFilter<StoredDocument>,
        opts?: { returnDocument?: ReturnDocument },
      ) => Promise<StoredDocument | null>,
    ) {
      findOneAndUpdateImpl = fn;
    },
    setFindOneAndDeleteImpl(fn: (filter: Filter<StoredDocument>) => Promise<StoredDocument | null>) {
      findOneAndDeleteImpl = fn;
    },
  };
}

function createFakeDb(collection: Collection<StoredDocument>): Db {
  return { collection: () => collection } as unknown as Db;
}

function stubDocument(): Omit<StoredDocument, '_id' | 'ownerId'> {
  return {
    title: 'Invoice',
    customer: 'Acme',
    issueDate: '2026-08-13',
    status: 'draft',
    lines: [],
    totals: { subtotal: 0, totalDiscount: 0, totalTax: 0, grandTotal: 0 },
    createdAt: new Date('2026-08-13T00:00:00.000Z'),
    updatedAt: new Date('2026-08-13T00:00:00.000Z'),
  };
}

describe('documents.repository', () => {
  it('list scopes to ownerId', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    await repository.list('owner-1');
    expect(fake.findFilters).toEqual([{ ownerId: 'owner-1' }]);
  });

  it('list sorts newest-first by issueDate then createdAt', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    await repository.list('owner-1');
    expect(fake.findSorts).toEqual([{ issueDate: -1, createdAt: -1 }]);
  });

  it('findById filters {_id, ownerId} in one call', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    const id = new ObjectId().toHexString();
    await repository.findById('owner-1', id);
    expect(fake.findOneFilters).toHaveLength(1);
    expect(fake.findOneFilters[0]).toMatchObject({ _id: new ObjectId(id), ownerId: 'owner-1' });
  });

  it('findById returns null for a malformed id instead of querying', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    const result = await repository.findById('owner-1', 'not-a-valid-object-id');
    expect(result).toBeNull();
    expect(fake.findOneFilters).toHaveLength(0);
  });

  it('findById propagates a driver/query failure instead of reporting not-found', async () => {
    const fake = createFakeCollection();
    const failingCollection = {
      ...fake.collection,
      findOne: async () => {
        throw new Error('connection reset');
      },
    } as unknown as Collection<StoredDocument>;
    const repository = createDocumentsRepository(createFakeDb(failingCollection));
    await expect(repository.findById('owner-1', new ObjectId().toHexString())).rejects.toThrow('connection reset');
  });

  it('insert stamps ownerId', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    await repository.insert('owner-1', stubDocument());
    expect(fake.insertedDocuments).toHaveLength(1);
    expect(fake.insertedDocuments[0]).toMatchObject({ ownerId: 'owner-1' });
  });

  it('update scopes to owner and requires status: draft', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    const id = new ObjectId().toHexString();
    await repository.update('owner-1', id, { title: 'Updated' });
    expect(fake.updateCalls).toHaveLength(1);
    expect(fake.updateCalls[0]!.filter).toMatchObject({
      _id: new ObjectId(id),
      ownerId: 'owner-1',
      status: 'draft',
    });
    expect(fake.updateCalls[0]!.update).toEqual({ $set: { title: 'Updated' } });
  });

  it('update returns null when the conditional write finds no matching draft', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    fake.findOneAndUpdateResults.push(null);

    const result = await repository.update('owner-1', new ObjectId().toHexString(), { title: 'Updated' });

    expect(result).toBeNull();
  });

  it('remove scopes to owner and requires status: draft', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    const id = new ObjectId().toHexString();
    await repository.remove('owner-1', id);
    expect(fake.deleteFilters).toHaveLength(1);
    expect(fake.deleteFilters[0]).toMatchObject({
      _id: new ObjectId(id),
      ownerId: 'owner-1',
      status: 'draft',
    });
  });

  it('remove returns null when the conditional delete finds no matching draft', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    fake.findOneAndDeleteResults.push(null);

    const result = await repository.remove('owner-1', new ObjectId().toHexString());

    expect(result).toBeNull();
  });

  it('keeps independent owners scoped separately', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    const id = new ObjectId().toHexString();
    await repository.findById('owner-1', id);
    await repository.findById('owner-2', id);
    expect(fake.findOneFilters).toEqual([
      { _id: new ObjectId(id), ownerId: 'owner-1' },
      { _id: new ObjectId(id), ownerId: 'owner-2' },
    ]);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // finalizeIfDraft
  // ─────────────────────────────────────────────────────────────────────────────

  const STUB_TOTALS = { subtotal: 500, totalDiscount: 0, totalTax: 0, grandTotal: 500 };

  it('finalizeIfDraft calls findOneAndUpdate with conditional+revision filter, $set update, and returnDocument:after', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    const id = new ObjectId();
    const idHex = id.toHexString();
    const ownerId = 'owner-1';
    const expectedUpdatedAt = new Date('2026-08-13T00:00:00.000Z');

    let capturedFilter: Filter<StoredDocument> | undefined;
    let capturedUpdate: UpdateFilter<StoredDocument> | undefined;
    let capturedOpts: { returnDocument?: ReturnDocument } | undefined;
    fake.setFindOneAndUpdateImpl((filter, update, opts) => {
      capturedFilter = filter;
      capturedUpdate = update;
      capturedOpts = opts;
      return Promise.resolve(null);
    });

    await repository.finalizeIfDraft(ownerId, idHex, expectedUpdatedAt, STUB_TOTALS);

    expect(capturedFilter).toMatchObject({
      _id: id,
      ownerId,
      status: 'draft',
      updatedAt: expectedUpdatedAt,
    });
    expect(capturedUpdate).toEqual({
      $set: { status: 'finalized', totals: STUB_TOTALS, updatedAt: expect.any(Date) },
    });
    expect(capturedOpts).toEqual({ returnDocument: 'after' });
  });

  it('finalizeIfDraft returns the post-image on a match', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    const idHex = new ObjectId().toHexString();
    const postImage: StoredDocument = {
      _id: new ObjectId(idHex),
      ownerId: 'owner-1',
      title: 'Invoice',
      customer: 'Acme',
      issueDate: '2026-08-13',
      status: 'finalized',
      lines: [],
      totals: STUB_TOTALS,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    fake.findOneAndUpdateResults.push(postImage);

    const result = await repository.finalizeIfDraft('owner-1', idHex, new Date(), STUB_TOTALS);

    expect(result).toEqual(postImage);
  });

  it('finalizeIfDraft returns null when the document is already finalized', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    fake.findOneAndUpdateResults.push(null);

    const result = await repository.finalizeIfDraft(
      'owner-1',
      new ObjectId().toHexString(),
      new Date(),
      STUB_TOTALS,
    );

    expect(result).toBeNull();
  });

  it('finalizeIfDraft returns null for a foreign ownerId', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    fake.findOneAndUpdateResults.push(null);

    const result = await repository.finalizeIfDraft(
      'wrong-owner',
      new ObjectId().toHexString(),
      new Date(),
      STUB_TOTALS,
    );

    expect(result).toBeNull();
  });

  it('finalizeIfDraft returns null when a concurrent draft mutation changed updatedAt since validation', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    // The real filter (validated by the "conditional+revision filter" test above)
    // includes updatedAt, so a stale expectedUpdatedAt simply finds no match.
    fake.findOneAndUpdateResults.push(null);

    const result = await repository.finalizeIfDraft(
      'owner-1',
      new ObjectId().toHexString(),
      new Date('2020-01-01T00:00:00.000Z'),
      STUB_TOTALS,
    );

    expect(result).toBeNull();
  });

  it('finalizeIfDraft returns null for a malformed id without querying', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));

    const result = await repository.finalizeIfDraft('owner-1', 'not-a-valid-object-id', new Date(), STUB_TOTALS);

    expect(result).toBeNull();
    expect(fake.findOneAndUpdateResults).toHaveLength(0);
  });

  it('finalizeIfDraft: exactly one of two concurrent calls succeeds', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    const idHex = new ObjectId().toHexString();
    const ownerId = 'owner-1';
    const expectedUpdatedAt = new Date('2026-08-13T00:00:00.000Z');
    const postImage: StoredDocument = {
      _id: new ObjectId(idHex),
      ownerId,
      title: 'Invoice',
      customer: 'Acme',
      issueDate: '2026-08-13',
      status: 'finalized',
      lines: [],
      totals: STUB_TOTALS,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // First call succeeds; second finds no match.
    fake.findOneAndUpdateResults.push(postImage);
    fake.findOneAndUpdateResults.push(null);

    const [result1, result2] = await Promise.all([
      repository.finalizeIfDraft(ownerId, idHex, expectedUpdatedAt, STUB_TOTALS),
      repository.finalizeIfDraft(ownerId, idHex, expectedUpdatedAt, STUB_TOTALS),
    ]);

    expect([result1, result2]).toContain(postImage);
    expect([result1, result2]).toContain(null);
    expect(result1).not.toEqual(result2);
  });
});
