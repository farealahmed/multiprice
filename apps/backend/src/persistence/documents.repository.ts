import { ObjectId, type Db, type Sort } from 'mongodb';
import type { StoredDocument, StoredTotals } from '../domain/document.ts';
import { createOwnedRepository } from './repository.ts';

export interface DocumentsRepository {
  list(ownerId: string): Promise<StoredDocument[]>;
  findById(ownerId: string, id: string): Promise<StoredDocument | null>;
  insert(ownerId: string, document: Omit<StoredDocument, '_id' | 'ownerId'>): Promise<{ insertedId: ObjectId }>;
  /**
   * Atomically applies `patch` to a document that is still a draft.
   *
   * Returns the post-image on a match (document was and remained a draft).
   * Returns null on no match (not found, wrong owner, or already finalized) —
   * the caller must re-check existence to tell those cases apart, since this
   * filter cannot distinguish them.
   */
  update(
    ownerId: string,
    id: string,
    patch: Partial<Omit<StoredDocument, '_id' | 'ownerId'>>,
  ): Promise<StoredDocument | null>;
  /**
   * Atomically removes a document that is still a draft.
   *
   * Returns the pre-image on a match (document was a draft). Returns null on
   * no match — same not-found-vs-finalized ambiguity as `update`.
   */
  remove(ownerId: string, id: string): Promise<StoredDocument | null>;
  /**
   * Atomically flips a draft document to finalized, persisting freshly
   * computed totals in the same write.
   *
   * `expectedUpdatedAt` pins the write to the exact revision the caller
   * validated and computed `totals` from: a concurrent draft mutation bumps
   * `updatedAt`, so it loses this race too even though the document is still
   * a draft, guaranteeing the finalized totals match the finalized lines.
   *
   * Returns the post-image on a match. Returns null on no match (already
   * finalized, concurrently mutated, wrong owner, or wrong id).
   * No re-read and retry — the caller must handle null as a lost race.
   */
  finalizeIfDraft(
    ownerId: string,
    id: string,
    expectedUpdatedAt: Date,
    totals: StoredTotals,
  ): Promise<StoredDocument | null>;
}

const LIST_SORT: Sort = { issueDate: -1, createdAt: -1 };

type InsertDocument<T> = Omit<T, 'ownerId'>;

export function createDocumentsRepository(db: Db): DocumentsRepository {
  const collection = db.collection<StoredDocument>('documents');
  const base = createOwnedRepository(collection);

  return {
    list: async (ownerId) => {
      const cursor = base.find(ownerId, {});
      return cursor.sort(LIST_SORT).toArray();
    },

    findById: async (ownerId, id) => {
      let objectId: ObjectId;
      try {
        objectId = new ObjectId(id);
      } catch {
        // Invalid ObjectId shape → treat as not found.
        return null;
      }
      return base.findOne(ownerId, { _id: objectId });
    },

    insert: async (ownerId, document) => {
      const result = await base.insertOne(ownerId, document as InsertDocument<StoredDocument>);
      return { insertedId: result.insertedId };
    },

    update: async (ownerId, id, patch) => {
      return collection.findOneAndUpdate(
        { _id: new ObjectId(id), ownerId, status: 'draft' },
        { $set: patch },
        { returnDocument: 'after' },
      );
    },

    remove: async (ownerId, id) => {
      return collection.findOneAndDelete({ _id: new ObjectId(id), ownerId, status: 'draft' });
    },

    finalizeIfDraft: async (ownerId, id, expectedUpdatedAt, totals) => {
      let objectId: ObjectId;
      try {
        objectId = new ObjectId(id);
      } catch {
        return null;
      }
      const result = await collection.findOneAndUpdate(
        { _id: objectId, ownerId, status: 'draft', updatedAt: expectedUpdatedAt },
        { $set: { status: 'finalized', totals, updatedAt: new Date() } },
        { returnDocument: 'after' },
      );
      return result;
    },
  };
}
