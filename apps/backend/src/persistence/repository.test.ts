import { describe, expect, it } from 'vitest';
import type { Collection, Document, Filter, UpdateFilter } from 'mongodb';
import { createOwnedRepository } from './repository.ts';

type TestDocument = Document & {
  status?: string;
  title?: string;
  ownerId?: string;
};

function createFakeCollection() {
  const findOneFilters: Filter<TestDocument>[] = [];
  const findFilters: Filter<TestDocument>[] = [];
  const insertedDocuments: TestDocument[] = [];
  const updateCalls: Array<{ filter: Filter<TestDocument>; update: UpdateFilter<TestDocument> }> = [];
  const deleteFilters: Filter<TestDocument>[] = [];

  const collection = {
    findOne: async (filter: Filter<TestDocument>) => {
      findOneFilters.push(filter);
      return null;
    },
    find: (filter: Filter<TestDocument>) => {
      findFilters.push(filter);
      return {};
    },
    insertOne: async (document: TestDocument) => {
      insertedDocuments.push(document);
      return { acknowledged: true, insertedId: 'test-id' };
    },
    updateOne: async (filter: Filter<TestDocument>, update: UpdateFilter<TestDocument>) => {
      updateCalls.push({ filter, update });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    },
    deleteOne: async (filter: Filter<TestDocument>) => {
      deleteFilters.push(filter);
      return { acknowledged: true, deletedCount: 1 };
    },
  } as unknown as Collection<TestDocument>;

  return {
    collection,
    findOneFilters,
    findFilters,
    insertedDocuments,
    updateCalls,
    deleteFilters,
  };
}

describe('createOwnedRepository', () => {
  it('scopes findOne to the owner', async () => {
    const fake = createFakeCollection();
    const repository = createOwnedRepository(fake.collection);

    await repository.findOne('owner-1', { status: 'draft' });

    expect(fake.findOneFilters).toEqual([{ status: 'draft', ownerId: 'owner-1' }]);
  });

  it('scopes find to the owner', () => {
    const fake = createFakeCollection();
    const repository = createOwnedRepository(fake.collection);

    repository.find('owner-1', { status: 'draft' });

    expect(fake.findFilters).toEqual([{ status: 'draft', ownerId: 'owner-1' }]);
  });

  it('stamps insertOne documents with the owner', async () => {
    const fake = createFakeCollection();
    const repository = createOwnedRepository(fake.collection);

    await repository.insertOne('owner-1', { title: 'x' });

    expect(fake.insertedDocuments).toEqual([{ title: 'x', ownerId: 'owner-1' }]);
  });

  it('scopes updateOne to the owner', async () => {
    const fake = createFakeCollection();
    const repository = createOwnedRepository(fake.collection);
    const update = { $set: { status: 'published' } };

    await repository.updateOne('owner-1', { status: 'draft' }, update);

    expect(fake.updateCalls).toEqual([
      { filter: { status: 'draft', ownerId: 'owner-1' }, update },
    ]);
  });

  it('scopes deleteOne to the owner', async () => {
    const fake = createFakeCollection();
    const repository = createOwnedRepository(fake.collection);

    await repository.deleteOne('owner-1', { status: 'draft' });

    expect(fake.deleteFilters).toEqual([{ status: 'draft', ownerId: 'owner-1' }]);
  });

  it('keeps independent owners scoped separately', async () => {
    const fake = createFakeCollection();
    const repository = createOwnedRepository(fake.collection);

    await repository.findOne('owner-1', { status: 'draft' });
    await repository.findOne('owner-2', { status: 'draft' });

    expect(fake.findOneFilters).toEqual([
      { status: 'draft', ownerId: 'owner-1' },
      { status: 'draft', ownerId: 'owner-2' },
    ]);
  });
});
