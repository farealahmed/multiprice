import { ObjectId, type Db, type Sort } from 'mongodb';
import type { StoredDocument } from '../domain/document.ts';
import { createOwnedRepository } from './repository.ts';

export interface DocumentsRepository {
  list(ownerId: string): Promise<StoredDocument[]>;
  findById(ownerId: string, id: string): Promise<StoredDocument | null>;
  insert(ownerId: string, document: Omit<StoredDocument, '_id' | 'ownerId'>): Promise<{ insertedId: ObjectId }>;
  update(ownerId: string, id: string, patch: Partial<Omit<StoredDocument, '_id' | 'ownerId'>>): Promise<void>;
  remove(ownerId: string, id: string): Promise<void>;
}

const LIST_SORT: Sort = { issueDate: -1, createdAt: -1 };

type InsertDocument<T> = Omit<T, 'ownerId'>;

export function createDocumentsRepository(db: Db): DocumentsRepository {
  const base = createOwnedRepository<StoredDocument>(db.collection<StoredDocument>('documents'));

  return {
    list: async (ownerId) => {
      const cursor = base.find(ownerId, {});
      return cursor.sort(LIST_SORT).toArray();
    },

    findById: async (ownerId, id) => {
      try {
        return await base.findOne(ownerId, { _id: new ObjectId(id) });
      } catch {
        // Invalid ObjectId shape → treat as not found.
        return null;
      }
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
  };
}
