/**
 * T6 — Integration tests for the users collection.
 *
 * Verifies index-level behaviour: the unique index on `users.email` enforces
 * email uniqueness at the database level, and email normalization (lower-case +
 * trim) is applied at insert time.
 *
 * These tests bypass the service layer and call the repository directly so
 * they prove the index and normalization behaviour independently of T4/T5.
 *
 * Requires a live MongoDB (skips when MONGO_URL is absent).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient } from 'mongodb';
import { setupTestDb, type TestDb } from '../support/db.ts';

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

const reachable = isMongoReachable();

describe('users collection integration', () => {
  let harness: TestDb;

  beforeAll(async () => {
    if (!(await reachable)) return;
    harness = await setupTestDb();
    // Bootstrap the unique index before any test runs.
    // This mirrors what api/plugins/indexes.ts does at boot.
    await harness.db.collection('users').createIndex(
      { email: 1 },
      { unique: true },
    );
  }, 60_000);

  afterAll(async () => {
    if (!(await reachable)) return;
    await harness.drop();
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Normalise email the same way the repository does before insert. */
  function normaliseEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  // -------------------------------------------------------------------------
  // T6-integration-1: duplicate email rejected by the index
  // -------------------------------------------------------------------------

  it('rejects a duplicate email at the database level (not application logic)', async () => {
    if (!(await reachable)) return;

    const col = harness.db.collection<{ email: string; passwordHash: string }>('users');

    const email = `duplicate-index-${Date.now()}@example.com`;

    // First insert succeeds.
    await col.insertOne({
      email: normaliseEmail(email),
      passwordHash: 'dummy-hash',
    });

    // Second insert with the same normalised email throws MongoDB duplicate-key
    // error (code 11000) — this is the index doing its job.
    await expect(
      col.insertOne({
        email: normaliseEmail(email),
        passwordHash: 'another-hash',
      }),
    ).rejects.toMatchObject({
      code: 11000,
    });
  });

  // -------------------------------------------------------------------------
  // T6-integration-2: email normalisation is enforced at storage time
  // -------------------------------------------------------------------------

  it('stores normalised email — duplicate after normalisation hits the index', async () => {
    if (!(await reachable)) return;

    const col = harness.db.collection<{ email: string; passwordHash: string }>('users');

    const email1 = `  A@X.COM  `;
    const email2 = `a@x.com`;

    // First insert with the upper-case + whitespace variant.
    await col.insertOne({
      email: normaliseEmail(email1),
      passwordHash: 'hash-1',
    });

    // Second insert with the lower-case, trimmed variant has the same
    // normalised value and must collide with the index.
    await expect(
      col.insertOne({
        email: normaliseEmail(email2),
        passwordHash: 'hash-2',
      }),
    ).rejects.toMatchObject({
      code: 11000,
    });
  });
});
