import { describe, expect, it } from 'vitest';
import { ObjectId, type Collection, type Db, type Filter, type Sort, type UpdateFilter } from 'mongodb';
import type { StoredDocument } from '../domain/document.ts';
import { createDocumentsRepository } from './documents.repository.ts';

function createFakeCollection() {
  const findOneFilters: Filter<StoredDocument>[] = [];
  const findFilters: Filter<StoredDocument>[] = [];
  const findSorts: Sort[] = [];
  const insertedDocuments: StoredDocument[] = [];
  const updateCalls: Array<{ filter: Filter<StoredDocument>; update: UpdateFilter<StoredDocument> }> = [];
  const deleteFilters: Filter<StoredDocument>[] = [];

  const createCursor = () => ({
    sort: (sortSpec: Sort) => {
      findSorts.push(sortSpec);
      return {
        toArray: async () => [],
      };
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
  } as unknown as Collection<StoredDocument>;

  return {
    collection,
    findOneFilters,
    findFilters,
    findSorts,
    insertedDocuments,
    updateCalls,
    deleteFilters,
  };
}

function createFakeDb(collection: Collection<StoredDocument>): Db {
  return {
    collection: () => collection,
  } as unknown as Db;
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

  it('insert stamps ownerId', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));

    await repository.insert('owner-1', stubDocument());

    expect(fake.insertedDocuments).toHaveLength(1);
    expect(fake.insertedDocuments[0]).toMatchObject({ ownerId: 'owner-1' });
  });

  it('update scopes to owner', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    const id = new ObjectId().toHexString();
    const patch = { title: 'Updated' };

    await repository.update('owner-1', id, patch);

    expect(fake.updateCalls).toHaveLength(1);
    const updateCall = fake.updateCalls[0]!;
    expect(updateCall.filter).toMatchObject({ _id: new ObjectId(id), ownerId: 'owner-1' });
    expect(updateCall.update).toEqual({ $set: patch });
  });

  it('remove scopes to owner', async () => {
    const fake = createFakeCollection();
    const repository = createDocumentsRepository(createFakeDb(fake.collection));
    const id = new ObjectId().toHexString();

    await repository.remove('owner-1', id);

    expect(fake.deleteFilters).toHaveLength(1);
    expect(fake.deleteFilters[0]).toMatchObject({ _id: new ObjectId(id), ownerId: 'owner-1' });
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
});
