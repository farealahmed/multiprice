import type { Collection, Document, Filter, OptionalUnlessRequiredId, UpdateFilter } from 'mongodb';

type InsertDocument<T extends Document> = Omit<OptionalUnlessRequiredId<T>, 'ownerId'>;

function withOwner<T extends Document>(ownerId: string, filter: Filter<T>): Filter<T> {
  return { ...filter, ownerId } as Filter<T>;
}

export function createOwnedRepository<T extends Document>(collection: Collection<T>) {
  return {
    findOne: (ownerId: string, filter: Filter<T>) => collection.findOne(withOwner(ownerId, filter)),
    find: (ownerId: string, filter: Filter<T>) => collection.find(withOwner(ownerId, filter)),
    insertOne: (ownerId: string, document: InsertDocument<T>) =>
      collection.insertOne({ ...document, ownerId } as unknown as OptionalUnlessRequiredId<T>),
    updateOne: (ownerId: string, filter: Filter<T>, update: UpdateFilter<T>) =>
      collection.updateOne(withOwner(ownerId, filter), update),
    deleteOne: (ownerId: string, filter: Filter<T>) => collection.deleteOne(withOwner(ownerId, filter)),
  };
}
