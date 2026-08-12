/**
 * Integration test harness — Lane T3.
 *
 * Connects to the configured Mongo instance (from env) and hands each test file
 * its own uniquely-named database.  Tests get isolation without requiring
 * Testcontainers: the dev compose Mongo is reused directly.
 *
 * Usage:
 *   const { db, drop } = await setupTestDb();
 *   // write data, run tests …
 *   await drop();
 *
 * Every Phase 3+ integration test reuses this file unmodified.
 */

import { MongoClient, type Db } from 'mongodb';

export interface TestDb {
  /** The uniquely-named test database. */
  db: Db;
  /**
   * Drop (or empty) the test database.
   * Call this in `afterEach` / `afterAll` of the consuming test file.
   */
  drop(): Promise<void>;
}

/**
 * Global counter suffix appended to the test db name.
 * Incremented per-call so parallel tests within the same process also get
 * isolation (vitest runs describe blocks concurrently when using `workers = 1`
 * — the suffix ensures two `setupTestDb()` calls in the same process always
 * get different names).
 */
let _serial = 0;

function uniqueDbName(): string {
  // YYYY-MM-DD -- pid -- serial so forks (vitest workers) also differ.
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `test_${stamp}_${process.pid}_${++_serial}`;
}

/**
 * Set up a test database.
 *
 * Reads `MONGO_URL` and `MONGO_DB` from `process.env`.  The mongo client
 * connects without a default database on the URL, then creates a fresh db per
 * call.  The db is dropped on teardown.
 */
export async function setupTestDb(): Promise<TestDb> {
  const url = process.env.MONGO_URL;
  if (!url) throw new Error('setupTestDb: MONGO_URL is not set in process.env');

  const client = new MongoClient(url);

  // Verify connectivity before handing the db out.
  await client.connect();

  const dbName = uniqueDbName();
  const db = client.db(dbName);

  return {
    db,
    async drop() {
      await client.db(dbName).dropDatabase();
      await client.close();
    },
  };
}
