import { ObjectId, type Db } from 'mongodb';
import type { User } from '../domain/user.ts';

export interface UsersRepository {
  create(input: { email: string; passwordHash: string; createdAt: Date }): Promise<{ insertedId: ObjectId }>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createUsersRepository(db: Db): UsersRepository {
  const collection = db.collection<User>('users');

  return {
    create: async (input) => {
      const result = await collection.insertOne({
        email: normalizeEmail(input.email),
        passwordHash: input.passwordHash,
        createdAt: input.createdAt,
      } as User);
      return { insertedId: result.insertedId };
    },

    findByEmail: async (email) =>
      collection.findOne({ email: normalizeEmail(email) }),

    findById: async (id) => {
      try {
        return await collection.findOne({ _id: new ObjectId(id) });
      } catch {
        // Invalid ObjectId shape → treat as not found.
        return null;
      }
    },
  };
}
