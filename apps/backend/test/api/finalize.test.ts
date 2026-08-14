/**
 * T6 — Finalize endpoint evidence.
 *
 * The invalid persisted-line case updates Mongo directly: the API correctly
 * rejects that data on ordinary writes, so direct seeding is required to model
 * data saved before a validation rule became stricter.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MongoClient, ObjectId } from 'mongodb';

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

describe.skipIf(!mongoReachable)('POST /api/v1/documents/:id/finalize', () => {
  it('finalizes a valid draft and returns the PDF fixture grand total', async () => {
    const cookie = await createAuthenticatedUser(app, 'finalize-pdf-sample');
    const id = await createDocument(cookie, { lines: pdfSampleLinesWithDescriptions });

    const response = await finalize(cookie, id);

    expect(response.statusCode).toBe(200);
    const body = response.json() as { status: string; totals: { grandTotal: number } };
    expect(body.status).toBe('finalized');
    expect(body.totals.grandTotal).toBeCloseTo(pdfSampleExpected.grandTotal, 2);
  });

  it('returns 409 DOCUMENT_FINALIZED when called twice', async () => {
    const cookie = await createAuthenticatedUser(app, 'finalize-twice');
    const id = await createDocument(cookie, { lines: [buildLinePayload()] });
    expect((await finalize(cookie, id)).statusCode).toBe(200);

    const response = await finalize(cookie, id);

    expect(response.statusCode).toBe(409);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe('DOCUMENT_FINALIZED');
  });

  it('rejects an invalid persisted line with its specific validation code', async () => {
    const cookie = await createAuthenticatedUser(app, 'finalize-invalid-persisted');
    const id = await createDocument(cookie, { lines: [buildLinePayload()] });

    // Test-only invalid state: normal API writes cannot persist this line.
    const update = await harness.db.collection('documents').updateOne(
      { _id: new ObjectId(id) },
      { $set: { 'lines.0.discount': { type: 'fixed', value: 100_000 } } },
    );
    expect(update.modifiedCount).toBe(1);

    const response = await finalize(cookie, id);

    expect(response.statusCode).toBe(400);
    const body = response.json() as {
      error: { code: string; details: Array<{ code: string; path: string }> };
    };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({
        code: 'DISCOUNT_EXCEEDS_SUBTOTAL',
        path: 'lines.0.discount.value',
      }),
    );
  });

  it('rejects a persisted line with a negative unit price with its specific validation code', async () => {
    const cookie = await createAuthenticatedUser(app, 'finalize-negative-price');
    const id = await createDocument(cookie, { lines: [buildLinePayload()] });

    // Test-only invalid state: normal API writes cannot persist a negative price.
    const update = await harness.db.collection('documents').updateOne(
      { _id: new ObjectId(id) },
      { $set: { 'lines.0.unitPrice': -100 } },
    );
    expect(update.modifiedCount).toBe(1);

    const response = await finalize(cookie, id);

    expect(response.statusCode).toBe(400);
    const body = response.json() as {
      error: { code: string; details: Array<{ code: string }> };
    };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'UNIT_PRICE_NEGATIVE' }),
    );
  });

  it('rejects an empty document with DOCUMENT_HAS_NO_LINES', async () => {
    const cookie = await createAuthenticatedUser(app, 'finalize-empty');
    const id = await createDocument(cookie);

    const response = await finalize(cookie, id);

    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe('DOCUMENT_HAS_NO_LINES');
  });

  it('returns 404 DOCUMENT_NOT_FOUND for another owner’s document', async () => {
    const ownerCookie = await createAuthenticatedUser(app, 'finalize-owner');
    const foreignCookie = await createAuthenticatedUser(app, 'finalize-foreign');
    const id = await createDocument(ownerCookie, { lines: [buildLinePayload()] });

    const response = await finalize(foreignCookie, id);

    expect(response.statusCode).toBe(404);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe('DOCUMENT_NOT_FOUND');
  });
});
