import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import { setupTestDb, type TestDb } from '../../test/support/db.ts';
import { createUsersRepository, type UsersRepository } from './users.repository.ts';
import type { User } from '../domain/user.ts';

async function isMongoReachable(): Promise<boolean> {
  const url = process.env.MONGO_URL;
  if (!url) return false;
  try {
    const client = new MongoClient(url);
    await client.connect();
    await client.close();
    return true;
  } catch {
    return false;
  }
}

describe('users.repository', () => {
  let harness: TestDb;
  let repository: UsersRepository;
  const reachable = isMongoReachable();

  beforeAll(async () => {
    if (!(await reachable)) return;
    harness = await setupTestDb();
    repository = createUsersRepository(harness.db);
    // Simulate the boot-time unique index the app would have created.
    await harness.db.collection<User>('users').createIndex({ email: 1 }, { unique: true });
  }, 30_000);

  afterAll(async () => {
    if (!(await reachable)) return;
    await harness.drop();
  }, 30_000);

  it('create() stores a normalized, lowercased+trimmed email', async () => {
    if (!(await reachable)) return;

    const { insertedId } = await repository.create({
      email: ' Test@Example.com ',
      passwordHash: 'hash',
      createdAt: new Date('2026-08-13T00:00:00.000Z'),
    });

    const stored = await harness.db.collection<User>('users').findOne({ _id: insertedId });
    expect(stored?.email).toBe('test@example.com');
  });

  it('create() on a duplicate normalized email surfaces the driver duplicate-key error', async () => {
    if (!(await reachable)) return;

    await repository.create({
      email: 'duplicate@example.com',
      passwordHash: 'hash-a',
      createdAt: new Date(),
    });

    await expect(
      repository.create({
        email: 'Duplicate@Example.com',
        passwordHash: 'hash-b',
        createdAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('findByEmail is case/whitespace-insensitive', async () => {
    if (!(await reachable)) return;

    await repository.create({
      email: 'findme@example.com',
      passwordHash: 'hash',
      createdAt: new Date(),
    });

    const found = await repository.findByEmail('  FindMe@EXAMPLE.com  ');
    expect(found).not.toBeNull();
    expect(found?.email).toBe('findme@example.com');
  });

  it('findById returns the user for a valid id string', async () => {
    if (!(await reachable)) return;

    const { insertedId } = await repository.create({
      email: 'byid@example.com',
      passwordHash: 'hash',
      createdAt: new Date(),
    });

    const found = await repository.findById(insertedId.toHexString());
    expect(found?._id).toEqual(insertedId);
    expect(found?.email).toBe('byid@example.com');
  });

  it('findById returns null for an invalid id string', async () => {
    if (!(await reachable)) return;

    const found = await repository.findById('not-an-object-id');
    expect(found).toBeNull();
  });
});
