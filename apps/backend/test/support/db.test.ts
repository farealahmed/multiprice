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
    // Own harness, not the shared one — this test closes its client, and
    // the shared `harness` still needs to be live for the outer afterAll.
    const own = await setupTestDb();
    const dbName = own.db.databaseName;

    // Write a collection + document so the db is non-empty.
    await own.db.collection('ping').insertOne({ ping: 1 });

    // Drop and close.
    await own.drop();

    // Verify with an independent client — `own.drop()` already closed its
    // own client, so reusing it would only prove "client is closed," not
    // "database is gone."
    const url = process.env.MONGO_URL!;
    const checkClient = new MongoClient(url);
    await checkClient.connect();
    try {
      const { databases } = await checkClient.db().admin().listDatabases();
      expect(databases.map((d) => d.name)).not.toContain(dbName);
    } finally {
      await checkClient.close();
    }
  });
});
