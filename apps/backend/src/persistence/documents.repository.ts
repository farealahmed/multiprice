import { ObjectId, type Db, type Sort } from 'mongodb';
import type { StoredDocument } from '../domain/document.ts';
import { createOwnedRepository } from './repository.ts';

export interface DocumentsRepository {
  list(ownerId: string): Promise<StoredDocument[]>;
  findById(ownerId: string, id: string): Promise<StoredDocument | null>;
  insert(ownerId: string, document: Omit<StoredDocument, '_id' | 'ownerId'>): Promise<{ insertedId: ObjectId }>;
  update(ownerId: string, id: string, patch: Partial<Omit<StoredDocument, '_id' | 'ownerId'>>): Promise<void>;
  remove(ownerId: string, id: string): Promise<void>;
  /**
   * Atomically flips a draft document to finalized.
   *
   * Returns the post-image on a match (document was and remained a draft).
   * Returns null on no match (already finalized, concurrent finalize, wrong owner, or wrong id).
   * No re-read and retry — the caller must handle null as a lost race.
   */
  finalizeIfDraft(ownerId: string, id: string): Promise<StoredDocument | null>;
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
      await base.updateOne(ownerId, { _id: new ObjectId(id) }, { $set: patch });
    },

    remove: async (ownerId, id) => {
      await base.deleteOne(ownerId, { _id: new ObjectId(id) });
    },

    finalizeIfDraft: async (ownerId, id) => {
      let objectId: ObjectId;
      try {
        objectId = new ObjectId(id);
      } catch {
        return null;
      }
      const result = await collection.findOneAndUpdate(
        { _id: objectId, ownerId, status: 'draft' },
        { $set: { status: 'finalized', updatedAt: new Date() } },
        { returnDocument: 'after' },
      );
      return result;
    },
  };
}
