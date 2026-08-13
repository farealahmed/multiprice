/**
 * T6 — HTTP-level line-item route tests.
 *
 * Tests POST/PATCH/DELETE /api/v1/documents/:id/lines[/:lineId] against
 * T1's frozen contract.  The routes are implemented in T5; these tests run
 * red until T5 lands — that is by design.
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

/** Create a document and return its id. */
async function createDocument(cookie: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: { cookie },
    payload: buildCreatePayload(),
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { id: string }).id;
}

/** Create a document with a line and return { docId, lineId }. */
async function createDocumentWithLine(cookie: string, linePayload = buildLinePayload()): Promise<{ docId: string; lineId: string }> {
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: { cookie },
    payload: {
      ...buildCreatePayload(),
      lines: [linePayload],
    },
  });
  expect(createRes.statusCode).toBe(201);
  const body = createRes.json() as { id: string; lines: Array<{ id: string }> };
  const firstLine = body.lines[0];
  if (!firstLine) throw new Error('Expected at least one line after document creation');
  return { docId: body.id, lineId: firstLine.id };
}

// ---------------------------------------------------------------------------
// POST /api/v1/documents/:id/lines
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('POST /api/v1/documents/:id/lines', () => {
  it('returns 200 with the updated document after appending a line', async () => {
    const cookie = await createAuthenticatedUser(app, 'append-line');
    const docId = await createDocument(cookie);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${docId}/lines`,
      headers: { cookie },
      payload: buildLinePayload({ description: 'Appended Line' }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { lines: Array<{ description: string }> };
    expect(body.lines).toHaveLength(1);
    const firstLine = body.lines[0];
    if (!firstLine) throw new Error('Expected at least one line after append');
    expect(firstLine.description).toBe('Appended Line');
  });

  it('returns 200 and includes pre-existing lines after appending', async () => {
    const cookie = await createAuthenticatedUser(app, 'append-preserves');
    const { docId, lineId } = await createDocumentWithLine(
      cookie,
      buildLinePayload({ description: 'Original Line' }),
    );

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${docId}/lines`,
      headers: { cookie },
      payload: buildLinePayload({ description: 'Appended Line' }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { lines: Array<{ id: string; description: string }> };
    expect(body.lines).toHaveLength(2);
    const original = body.lines.find((l) => l.id === lineId);
    expect(original?.description).toBe('Original Line');
    const appended = body.lines.find((l) => l.description === 'Appended Line');
    expect(appended).toBeTruthy();
  });

  it('returns 404 DOCUMENT_NOT_FOUND for a non-existent document id', async () => {
    const cookie = await createAuthenticatedUser(app, 'append-404-doc');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/000000000000000000000000/lines',
      headers: { cookie },
      payload: buildLinePayload(),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'DOCUMENT_NOT_FOUND' } });
  });

  it('returns 401 when no session cookie is present', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/some-id/lines',
      payload: buildLinePayload(),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/documents/:id/lines/:lineId
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('PATCH /api/v1/documents/:id/lines/:lineId', () => {
  it('returns 200 with the updated document after editing a line', async () => {
    const cookie = await createAuthenticatedUser(app, 'patch-line');
    const { docId, lineId } = await createDocumentWithLine(
      cookie,
      buildLinePayload({ description: 'Original' }),
    );

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${docId}/lines/${lineId}`,
      headers: { cookie },
      payload: { description: 'Updated Line' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { lines: Array<{ id: string; description: string }> };
    const updated = body.lines.find((l) => l.id === lineId);
    expect(updated?.description).toBe('Updated Line');
  });

  it('editing one line leaves other lines ids unchanged', async () => {
    const cookie = await createAuthenticatedUser(app, 'patch-preserves-ids');

    // Create a document with 3 lines.
    const line1 = buildLinePayload({ description: 'Line 1' });
    const line2 = buildLinePayload({ description: 'Line 2' });
    const line3 = buildLinePayload({ description: 'Line 3' });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: { ...buildCreatePayload(), lines: [line1, line2, line3] },
    });
    expect(createRes.statusCode).toBe(201);
    const { id: docId, lines } = createRes.json() as {
      id: string;
      lines: Array<{ id: string }>;
    };
    const targetLineId = lines[1]?.id;
    if (!targetLineId) throw new Error('Expected 3 lines from create');

    // Patch the middle line.
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${docId}/lines/${targetLineId}`,
      headers: { cookie },
      payload: { description: 'Patched Line 2' },
    });

    // Read back — other two line ids must be byte-identical.
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${docId}`,
      headers: { cookie },
    });
    expect(getRes.statusCode).toBe(200);
    const { lines: afterLines } = getRes.json() as { lines: Array<{ id: string }> };

    const [after0, after1, after2] = afterLines;
    if (!after0 || !after1 || !after2) throw new Error('Expected 3 lines after patch');
    expect(after0.id).toBe(lines[0]?.id);
    expect(after1.id).toBe(lines[1]?.id); // the patched one
    expect(after2.id).toBe(lines[2]?.id);
  });

  it('returns 404 DOCUMENT_NOT_FOUND for a non-existent document id', async () => {
    const cookie = await createAuthenticatedUser(app, 'patch-line-404-doc');

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/documents/000000000000000000000000/lines/any-line-id',
      headers: { cookie },
      payload: { description: 'Updated' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'DOCUMENT_NOT_FOUND' } });
  });

  it('returns 404 LINE_NOT_FOUND when the line id does not exist on the document', async () => {
    const cookie = await createAuthenticatedUser(app, 'patch-line-404-line');
    const docId = await createDocument(cookie);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${docId}/lines/non-existent-line-id`,
      headers: { cookie },
      payload: { description: 'Updated' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'LINE_NOT_FOUND' } });
  });

  it('returns 401 when no session cookie is present', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/documents/some-doc/lines/some-line',
      payload: { description: 'Updated' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/documents/:id/lines/:lineId
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('DELETE /api/v1/documents/:id/lines/:lineId', () => {
  it('returns 200 with the updated document after removing a line', async () => {
    const cookie = await createAuthenticatedUser(app, 'delete-line');
    const { docId, lineId } = await createDocumentWithLine(
      cookie,
      buildLinePayload({ description: 'To Be Deleted' }),
    );

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/documents/${docId}/lines/${lineId}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { lines: unknown[] };
    expect(body.lines).toHaveLength(0);
  });

  it('returns 200 and preserves remaining lines after deleting one', async () => {
    const cookie = await createAuthenticatedUser(app, 'delete-preserves');

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: {
        ...buildCreatePayload(),
        lines: [
          buildLinePayload({ description: 'Keep Me' }),
          buildLinePayload({ description: 'Delete Me' }),
        ],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const { id: docId, lines } = createRes.json() as { id: string; lines: Array<{ id: string }> };
    const firstLine = lines[0];
    const secondLine = lines[1];
    if (!firstLine || !secondLine) throw new Error('Expected 2 lines');
    const deleteId = secondLine.id;

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/documents/${docId}/lines/${deleteId}`,
      headers: { cookie },
    });

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${docId}`,
      headers: { cookie },
    });
    expect(getRes.statusCode).toBe(200);
    const { lines: afterLines } = getRes.json() as { lines: Array<{ description: string }> };
    expect(afterLines).toHaveLength(1);
    const remaining = afterLines[0];
    if (!remaining) throw new Error('Expected 1 remaining line');
    expect(remaining.description).toBe('Keep Me');
  });

  it('returns 404 DOCUMENT_NOT_FOUND for a non-existent document id', async () => {
    const cookie = await createAuthenticatedUser(app, 'delete-line-404-doc');

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/documents/000000000000000000000000/lines/any-line-id',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'DOCUMENT_NOT_FOUND' } });
  });

  it('returns 404 LINE_NOT_FOUND when the line id does not exist', async () => {
    const cookie = await createAuthenticatedUser(app, 'delete-line-404-line');
    const docId = await createDocument(cookie);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/documents/${docId}/lines/non-existent-line-id`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'LINE_NOT_FOUND' } });
  });

  it('returns 401 when no session cookie is present', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/documents/some-doc/lines/some-line',
    });
    expect(res.statusCode).toBe(401);
  });
});
