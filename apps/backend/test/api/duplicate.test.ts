/**
 * T6 — Duplicate endpoint evidence (stretch goal 1: copy a finalized document
 * into a new draft).
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
import { pdfSampleLines, pdfSampleExpected } from '../fixtures/pdf-sample.ts';

const pdfSampleLinesWithDescriptions = pdfSampleLines.map((line, index) => ({
  ...line,
  description: `PDF sample line ${index + 1}`,
}));

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
  if (app) await app.close();
  if (harness) await harness.drop();
});

async function createDocument(
  cookie: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: { cookie },
    payload: buildCreatePayload(overrides),
  });
  expect(response.statusCode).toBe(201);
  const body = response.json() as { id: string };
  return body.id;
}

async function finalize(cookie: string, id: string) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/documents/${id}/finalize`,
    headers: { cookie },
  });
}

async function duplicate(cookie: string, id: string) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/documents/${id}/duplicate`,
    headers: { cookie },
  });
}

describe.skipIf(!mongoReachable)('POST /api/v1/documents/:id/duplicate', () => {
  it('copies a finalized document into a new draft with matching totals', async () => {
    const cookie = await createAuthenticatedUser(app, 'duplicate-finalized');
    const id = await createDocument(cookie, { lines: pdfSampleLinesWithDescriptions });
    expect((await finalize(cookie, id)).statusCode).toBe(200);

    const response = await duplicate(cookie, id);

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      id: string;
      status: string;
      totals: { grandTotal: number };
    };
    expect(body.id).not.toBe(id);
    expect(body.status).toBe('draft');
    expect(body.totals.grandTotal).toBeCloseTo(pdfSampleExpected.grandTotal, 2);
  });

  it('leaves the source document finalized and untouched', async () => {
    const cookie = await createAuthenticatedUser(app, 'duplicate-source-untouched');
    const id = await createDocument(cookie, { lines: [buildLinePayload()] });
    expect((await finalize(cookie, id)).statusCode).toBe(200);

    await duplicate(cookie, id);

    const sourceResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${id}`,
      headers: { cookie },
    });
    const source = sourceResponse.json() as { status: string };
    expect(source.status).toBe('finalized');
  });

  it('mints new line ids for the duplicate rather than reusing the source’s', async () => {
    const cookie = await createAuthenticatedUser(app, 'duplicate-line-ids');
    const id = await createDocument(cookie, { lines: [buildLinePayload()] });
    const sourceBody = (
      await app.inject({ method: 'GET', url: `/api/v1/documents/${id}`, headers: { cookie } })
    ).json() as { lines: Array<{ id: string }> };

    const response = await duplicate(cookie, id);

    const copy = response.json() as { lines: Array<{ id: string }> };
    expect(copy.lines).toHaveLength(sourceBody.lines.length);
    expect(copy.lines[0]!.id).not.toBe(sourceBody.lines[0]!.id);
  });

  it('duplicates a draft too, producing an independent second draft', async () => {
    const cookie = await createAuthenticatedUser(app, 'duplicate-draft');
    const id = await createDocument(cookie, { lines: [buildLinePayload()] });

    const response = await duplicate(cookie, id);

    expect(response.statusCode).toBe(201);
    const body = response.json() as { id: string; status: string };
    expect(body.id).not.toBe(id);
    expect(body.status).toBe('draft');
  });

  it('returns 404 DOCUMENT_NOT_FOUND for another owner’s document', async () => {
    const ownerCookie = await createAuthenticatedUser(app, 'duplicate-owner');
    const foreignCookie = await createAuthenticatedUser(app, 'duplicate-foreign');
    const id = await createDocument(ownerCookie, { lines: [buildLinePayload()] });

    const response = await duplicate(foreignCookie, id);

    expect(response.statusCode).toBe(404);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe('DOCUMENT_NOT_FOUND');
  });

  it('returns 404 DOCUMENT_NOT_FOUND for a nonexistent document', async () => {
    const cookie = await createAuthenticatedUser(app, 'duplicate-missing');

    const response = await duplicate(cookie, '000000000000000000000000');

    expect(response.statusCode).toBe(404);
  });
});
