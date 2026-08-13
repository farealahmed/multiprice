/**
 * T6 — HTTP-level document route tests.
 *
 * Tests GET/POST /api/v1/documents and GET/PATCH/DELETE /api/v1/documents/:id
 * against T1's frozen contract.  The routes are implemented in T5; these tests
 * run red until T5 lands — that is by design (T6 runs in wave 2,
 * alongside T4, before T5 exists).
 *
 * All requests use `app.inject()` so Fastify's plugin pipeline is exercised.
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
  VALID_LINE,
} from '../support/factories.ts';
import { pdfSampleExpected, pdfSampleLines } from '../fixtures/pdf-sample.ts';

// `pdfSampleLines` is typed against the pricing contract, which has no
// `description` field. The document contract requires one per line, so
// route-level tests attach one here rather than growing the shared fixture.
const pdfSampleLinesWithDescriptions = pdfSampleLines.map((line, index) => ({
  ...line,
  description: `PDF sample line ${index + 1}`,
}));

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

/** Parse a Set-Cookie header into name=value. */
function parseSessionCookie(header: string | string[] | undefined): string | null {
  const headerStr = Array.isArray(header) ? header[0] : header;
  if (!headerStr) return null;
  const first = headerStr.split(';')[0] ?? '';
  return first || null;
}

// ---------------------------------------------------------------------------
// GET /api/v1/documents
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('GET /api/v1/documents', () => {
  it('returns 200 with an empty array when the owner has no documents', async () => {
    const cookie = await createAuthenticatedUser(app, 'list-empty');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/documents',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('returns 200 with the owner documents, newest-first by issueDate then createdAt', async () => {
    const cookie = await createAuthenticatedUser(app, 'list-sorted');

    // Create documents in non-sorted order.
    const older = buildCreatePayload({ title: 'Older', issueDate: '2026-01-01' });
    const newer = buildCreatePayload({ title: 'Newer', issueDate: '2026-06-01' });
    const mid = buildCreatePayload({ title: 'Mid', issueDate: '2026-03-15' });

    await app.inject({ method: 'POST', url: '/api/v1/documents', headers: { cookie }, payload: older });
    await app.inject({ method: 'POST', url: '/api/v1/documents', headers: { cookie }, payload: mid });
    await app.inject({ method: 'POST', url: '/api/v1/documents', headers: { cookie }, payload: newer });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/documents',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const docs = res.json() as unknown[];
    expect(docs).toHaveLength(3);
    // Newest first.
    expect(docs[0]).toMatchObject({ title: 'Newer' });
    expect(docs[1]).toMatchObject({ title: 'Mid' });
    expect(docs[2]).toMatchObject({ title: 'Older' });
  });

  it('omits lines from the list response', async () => {
    const cookie = await createAuthenticatedUser(app, 'list-no-lines');

    await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: {
        ...buildCreatePayload(),
        lines: [buildLinePayload({ description: 'Line One' })],
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/documents',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const docs = res.json() as Record<string, unknown>[];
    expect(docs).toHaveLength(1);
    expect(docs[0]).not.toHaveProperty('lines');
  });

  it('returns 401 when no session cookie is present', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/documents',
    });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/documents
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('POST /api/v1/documents', () => {
  it('returns 201 with a DocumentResponse on valid input', async () => {
    const cookie = await createAuthenticatedUser(app, 'create-valid');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: buildCreatePayload(),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      id: expect.any(String),
      title: 'Test Document',
      customer: 'Acme Corp',
      issueDate: '2026-01-15',
      status: 'draft',
      totals: {
        subtotal: 0,
        totalDiscount: 0,
        totalTax: 0,
        grandTotal: 0,
      },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(body).not.toHaveProperty('ownerId');
    expect(body.lines).toEqual([]);
  });

  it('returns 201 with the PDF sample totals — 450.00 / 40.00 / 11.50 / 421.50', async () => {
    const cookie = await createAuthenticatedUser(app, 'create-pdf');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: {
        ...buildCreatePayload(),
        lines: pdfSampleLinesWithDescriptions,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { totals: { subtotal: number; totalDiscount: number; totalTax: number; grandTotal: number } };
    // Values are in major units (dollars).
    expect(body.totals.subtotal).toBeCloseTo(450.0, 2);
    expect(body.totals.totalDiscount).toBeCloseTo(40.0, 2);
    expect(body.totals.totalTax).toBeCloseTo(11.5, 2);
    expect(body.totals.grandTotal).toBeCloseTo(421.5, 2);
  });

  it('persisted totals match engine output exactly', async () => {
    const cookie = await createAuthenticatedUser(app, 'persist-totals');

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: {
        ...buildCreatePayload(),
        lines: pdfSampleLinesWithDescriptions,
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = createRes.json() as { id: string };
    const { id } = created;

    // Read back — totals must match what was returned at create time.
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${id}`,
      headers: { cookie },
    });

    expect(getRes.statusCode).toBe(200);
    const doc = getRes.json() as { totals: { subtotal: number; totalDiscount: number; totalTax: number; grandTotal: number } };

    expect(doc.totals.subtotal).toBeCloseTo(pdfSampleExpected.subtotal, 2);
    expect(doc.totals.totalDiscount).toBeCloseTo(pdfSampleExpected.totalDiscount, 2);
    expect(doc.totals.totalTax).toBeCloseTo(pdfSampleExpected.totalTax, 2);
    expect(doc.totals.grandTotal).toBeCloseTo(pdfSampleExpected.grandTotal, 2);
  });

  it('rejects a payload with SERVER_MANAGED_FIELD totals', async () => {
    const cookie = await createAuthenticatedUser(app, 'reject-totals');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: {
        ...buildCreatePayload(),
        totals: { subtotal: 999, totalDiscount: 0, totalTax: 0, grandTotal: 999 },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string; details: Array<{ code: string; path: string }> } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'SERVER_MANAGED_FIELD', path: 'totals' }),
    );
  });

  it('rejects a payload with SERVER_MANAGED_FIELD status', async () => {
    const cookie = await createAuthenticatedUser(app, 'reject-status');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: {
        ...buildCreatePayload(),
        status: 'finalized',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string; details: Array<{ code: string; path: string }> } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'SERVER_MANAGED_FIELD', path: 'status' }),
    );
  });

  it('accepts a line with an echoed id and preserves it', async () => {
    const cookie = await createAuthenticatedUser(app, 'echo-id');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: {
        ...buildCreatePayload(),
        lines: [
          {
            ...buildLinePayload(),
            id: 'client-provided-id-abc123',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { lines: Array<{ id: string }> };
    const firstLine = body.lines[0];
    if (!firstLine) throw new Error('Expected at least one line');
    expect(firstLine.id).toBe('client-provided-id-abc123');
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/documents/:id
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('GET /api/v1/documents/:id', () => {
  it('returns 200 with the full document including lines', async () => {
    const cookie = await createAuthenticatedUser(app, 'get-full');

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: {
        ...buildCreatePayload(),
        lines: [buildLinePayload({ description: 'Get Test Line' })],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const { id } = createRes.json() as { id: string };

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${id}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      id,
      title: 'Test Document',
      lines: [
        expect.objectContaining({ description: 'Get Test Line' }),
      ],
    });
  });

  it('returns 404 DOCUMENT_NOT_FOUND for a non-existent id', async () => {
    const cookie = await createAuthenticatedUser(app, 'get-404');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/documents/000000000000000000000000',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('DOCUMENT_NOT_FOUND');
  });

  it('returns 401 when no session cookie is present', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/documents/some-id',
    });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/documents/:id
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('PATCH /api/v1/documents/:id', () => {
  it('returns 200 with an updated DocumentResponse on valid partial update', async () => {
    const cookie = await createAuthenticatedUser(app, 'patch-partial');

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: buildCreatePayload(),
    });
    const { id } = createRes.json() as { id: string };

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${id}`,
      headers: { cookie },
      payload: { title: 'Updated Title' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      id,
      title: 'Updated Title',
      customer: 'Acme Corp', // unchanged
    });
  });

  it('returns 200 and recomputes totals when the lines array is replaced', async () => {
    const cookie = await createAuthenticatedUser(app, 'patch-lines');

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: buildCreatePayload(),
    });
    const { id } = createRes.json() as { id: string };

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${id}`,
      headers: { cookie },
      payload: { lines: pdfSampleLinesWithDescriptions },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { totals: { grandTotal: number } };
    expect(body.totals.grandTotal).toBeCloseTo(421.5, 2);
  });

  it('rejects a patch that includes totals', async () => {
    const cookie = await createAuthenticatedUser(app, 'patch-reject-totals');

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: buildCreatePayload(),
    });
    const { id } = createRes.json() as { id: string };

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${id}`,
      headers: { cookie },
      payload: { totals: { subtotal: 0, totalDiscount: 0, totalTax: 0, grandTotal: 0 } },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string; details: Array<{ code: string; path: string }> } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'SERVER_MANAGED_FIELD', path: 'totals' }),
    );
  });

  it('returns 404 DOCUMENT_NOT_FOUND for a non-existent id', async () => {
    const cookie = await createAuthenticatedUser(app, 'patch-404');

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/documents/000000000000000000000000',
      headers: { cookie },
      payload: { title: 'Anything' },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('DOCUMENT_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/documents/:id
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('DELETE /api/v1/documents/:id', () => {
  it('returns 204 and removes the document', async () => {
    const cookie = await createAuthenticatedUser(app, 'delete-happy');

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: buildCreatePayload(),
    });
    const { id } = createRes.json() as { id: string };

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/documents/${id}`,
      headers: { cookie },
    });

    expect(deleteRes.statusCode).toBe(204);
    expect(deleteRes.body).toBe('');

    // Confirm it's gone.
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${id}`,
      headers: { cookie },
    });
    expect(getRes.statusCode).toBe(404);
  });

  it('returns 404 DOCUMENT_NOT_FOUND for a non-existent id', async () => {
    const cookie = await createAuthenticatedUser(app, 'delete-404');

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/documents/000000000000000000000000',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('DOCUMENT_NOT_FOUND');
  });
});
