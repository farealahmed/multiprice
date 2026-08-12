/**
 * Integration test harness — verification tests.
 * Tests: T3-smoke-1 (connect), T3-smoke-2 (unique db per call), T3-smoke-3 (teardown).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient } from 'mongodb';
import { setupTestDb, type TestDb } from './db.ts';

/**
 * Guard: skip the whole suite if no MongoDB is reachable.
 * The harness requires a live Mongo (R7 — connects to compose.dev.yml Mongo).
 * Tests that need Mongo are integration tests, not unit tests, so skipping is
 * the correct behaviour when the infrastructure is absent.
 */
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

describe('setupTestDb', () => {
  let harness: TestDb;
  const reachable = isMongoReachable();

  beforeAll(async () => {
    if (!(await reachable)) return;
    harness = await setupTestDb();
  }, 30_000);

  afterAll(async () => {
    if (!(await reachable)) return;
    // Ensure cleanup even if a test fails before calling drop().
    await harness.drop();
  }, 30_000);

  it('connects to the configured Mongo instance', async () => {
    if (!(await reachable)) return; // skip — no Mongo available
    // `db.command` exercises the wire protocol; failure here means bad MONGO_URL.
    const result = await harness.db.command({ ping: 1 });
    expect(result).toEqual({ ok: 1 });
  });

  it('hands out a uniquely-named database per call', async () => {
    if (!(await reachable)) return; // skip — no Mongo available
    const other = await setupTestDb();
    // The two database names must differ.
    expect(other.db.databaseName).not.toBe(harness.db.databaseName);
    await other.drop();
  });

  it('teardown drops the database', async () => {
    if (!(await reachable)) return; // skip — no Mongo available
    const dbName = harness.db.databaseName;
    const client = harness.db.client;

    // Write a collection + document so the db is non-empty.
    await harness.db.collection('ping').insertOne({ ping: 1 });

    // Drop and close.
    await harness.drop();

    // Trying to access the db after dropDatabase() should fail (db no longer exists).
    try {
      await client.db(dbName).command({ ping: 1 });
      // If we reach here the db still exists — fail.
      expect.fail('database should not exist after drop');
    } catch (err) {
      // Expected: command against a dropped db throws.
      expect((err as Error).message).toContain(dbName);
    }
  });
});
