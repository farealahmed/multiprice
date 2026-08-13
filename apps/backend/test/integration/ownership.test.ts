/**
 * T6 — Ownership isolation integration tests.
 *
 * Table-driven tests over every id-scoped route proving that User B's session
 * always receives 404 DOCUMENT_NOT_FOUND when accessing User A's document,
 * and that the list route never leaks another owner's documents (R7, R17).
 *
 * These tests bypass the service layer and call the HTTP routes directly,
 * exercising the full Fastify plugin pipeline (auth, repository, service).
 * Requires a live MongoDB.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MongoClient } from 'mongodb';

import { buildApp } from '../../src/app.ts';
import mongoPlugin from '../../src/persistence/mongo.ts';
import { setupTestDb, type TestDb } from '../support/db.ts';
import {
  buildCreatePayload,
  buildLinePayload,
  createAuthenticatedUser,
} from '../support/factories.ts';

// ---------------------------------------------------------------------------
// Guard
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

const mongoReachable = await isMongoReachable();

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let harness: TestDb;

beforeEach(async () => {
  process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
  process.env.COOKIE_NAME = 'mp_session';
  process.env.NODE_ENV = 'test';

  harness = await setupTestDb();

  app = await buildApp({ logger: false });
  await app.register(mongoPlugin, {
    url: 'mongodb://test-harness',
    dbName: harness.db.databaseName,
    client: {} as MongoClient,
    db: harness.db,
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await harness.drop();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Session = { cookie: string; userId: string };

/** Register two users and return their session cookies. */
async function twoUsers(): Promise<{ alice: Session; bob: Session }> {
  const [aliceCookie, bobCookie] = await Promise.all([
    createAuthenticatedUser(app, 'alice'),
    createAuthenticatedUser(app, 'bob'),
  ]);

  // Resolve user ids via /auth/me.
  async function me(cookie: string): Promise<string> {
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    return (res.json() as { id: string }).id;
  }

  const [aliceUserId, bobUserId] = await Promise.all([me(aliceCookie), me(bobCookie)]);
  return { alice: { cookie: aliceCookie, userId: aliceUserId }, bob: { cookie: bobCookie, userId: bobUserId } };
}

/** Alice creates a document and returns its id. */
async function aliceCreateDocument(cookie: string, withLine = false): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: { cookie },
    payload: {
      ...buildCreatePayload(),
      ...(withLine ? { lines: [buildLinePayload()] } : {}),
    },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { id: string }).id;
}

// ---------------------------------------------------------------------------
// Id-scoped route isolation
// ---------------------------------------------------------------------------

type InjectResult = { statusCode: number; json: () => { error: { code: string } } };

async function bobRequests(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, cookie: string, payload?: Record<string, unknown>): Promise<InjectResult> {
  if (payload !== undefined) {
    return await app.inject({ method, url, headers: { cookie }, payload }) as InjectResult;
  }
  return await app.inject({ method, url, headers: { cookie } }) as InjectResult;
}

describe.skipIf(!mongoReachable)('id-scoped routes: 404-not-403 for another owner', () => {
  it('GET /api/v1/documents/:id — user B gets 404 for user A\'s document', async () => {
    const { alice, bob } = await twoUsers();
    const docId = await aliceCreateDocument(alice.cookie);

    const res = await bobRequests('GET', `/api/v1/documents/${docId}`, bob.cookie);

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('DOCUMENT_NOT_FOUND');
  });

  it('PATCH /api/v1/documents/:id — user B gets 404 for user A\'s document', async () => {
    const { alice, bob } = await twoUsers();
    const docId = await aliceCreateDocument(alice.cookie);

    const res = await bobRequests('PATCH', `/api/v1/documents/${docId}`, bob.cookie, { title: 'Bob Tries' });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('DOCUMENT_NOT_FOUND');
  });

  it('DELETE /api/v1/documents/:id — user B gets 404 for user A\'s document', async () => {
    const { alice, bob } = await twoUsers();
    const docId = await aliceCreateDocument(alice.cookie);

    const res = await bobRequests('DELETE', `/api/v1/documents/${docId}`, bob.cookie);

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('DOCUMENT_NOT_FOUND');
  });

  it('POST /api/v1/documents/:id/lines — user B gets 404 for user A\'s document', async () => {
    const { alice, bob } = await twoUsers();
    const docId = await aliceCreateDocument(alice.cookie);

    const res = await bobRequests('POST', `/api/v1/documents/${docId}/lines`, bob.cookie, buildLinePayload());

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('DOCUMENT_NOT_FOUND');
  });

  it('PATCH /api/v1/documents/:id/lines/:lineId — user B gets 404 for user A\'s document', async () => {
    const { alice, bob } = await twoUsers();
    const docId = await aliceCreateDocument(alice.cookie, true);

    // Get the line id.
    const getRes = await app.inject({ method: 'GET', url: `/api/v1/documents/${docId}`, headers: { cookie: alice.cookie } });
    expect(getRes.statusCode).toBe(200);
    const lineId = (getRes.json() as { lines: Array<{ id: string }> }).lines[0]?.id;
    if (!lineId) throw new Error('Expected at least one line');

    const res = await bobRequests('PATCH', `/api/v1/documents/${docId}/lines/${lineId}`, bob.cookie, { description: 'Bob Tries' });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('DOCUMENT_NOT_FOUND');
  });

  it('DELETE /api/v1/documents/:id/lines/:lineId — user B gets 404 for user A\'s document', async () => {
    const { alice, bob } = await twoUsers();
    const docId = await aliceCreateDocument(alice.cookie, true);

    // Get the line id.
    const getRes = await app.inject({ method: 'GET', url: `/api/v1/documents/${docId}`, headers: { cookie: alice.cookie } });
    expect(getRes.statusCode).toBe(200);
    const lineId = (getRes.json() as { lines: Array<{ id: string }> }).lines[0]?.id;
    if (!lineId) throw new Error('Expected at least one line');

    const res = await bobRequests('DELETE', `/api/v1/documents/${docId}/lines/${lineId}`, bob.cookie);

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('DOCUMENT_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/documents — list never leaks another owner's documents
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('GET /api/v1/documents — list is owner-scoped', () => {
  it('returns an empty array when the owner has no documents', async () => {
    const { bob } = await twoUsers();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/documents',
      headers: { cookie: bob.cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('owner A sees only their own documents — owner B\'s are invisible', async () => {
    const { alice, bob } = await twoUsers();

    // Alice creates two documents.
    const alice1 = await aliceCreateDocument(alice.cookie);
    await aliceCreateDocument(alice.cookie);

    // Bob creates one document.
    const bob1 = await aliceCreateDocument(bob.cookie);

    // Alice lists — must not see Bob's.
    const aliceRes = await app.inject({
      method: 'GET',
      url: '/api/v1/documents',
      headers: { cookie: alice.cookie },
    });
    expect(aliceRes.statusCode).toBe(200);
    const aliceDocs = aliceRes.json() as Array<{ id: string }>;
    const aliceIds = aliceDocs.map((d) => d.id);
    expect(aliceIds).toContain(alice1);
    expect(aliceIds).not.toContain(bob1);
    expect(aliceDocs).toHaveLength(2);

    // Bob lists — must not see Alice's.
    const bobRes = await app.inject({
      method: 'GET',
      url: '/api/v1/documents',
      headers: { cookie: bob.cookie },
    });
    expect(bobRes.statusCode).toBe(200);
    const bobDocs = bobRes.json() as Array<{ id: string }>;
    const bobIds = bobDocs.map((d) => d.id);
    expect(bobIds).toContain(bob1);
    expect(bobIds).not.toContain(alice1);
    expect(bobDocs).toHaveLength(1);
  });

  it('list route does not include lines on any document', async () => {
    const { alice } = await twoUsers();

    // Alice creates a document with lines.
    await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie: alice.cookie },
      payload: {
        ...buildCreatePayload(),
        lines: [buildLinePayload()],
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/documents',
      headers: { cookie: alice.cookie },
    });

    expect(res.statusCode).toBe(200);
    const docs = res.json() as Array<Record<string, unknown>>;
    expect(docs).toHaveLength(1);
    docs.forEach((doc) => {
      expect(doc).not.toHaveProperty('lines');
    });
  });
});
