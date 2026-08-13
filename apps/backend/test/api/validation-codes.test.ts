/**
 * T6 — Validation code tests for the documents domain.
 *
 * One test per error code, asserting both HTTP status and the `code` value
 * in the response (not just the status — R18).  Runs against the frozen
 * contract; routes implemented in T5; this suite stays red until T5 lands.
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
let cookie: string;

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

  cookie = await createAuthenticatedUser(app, `validation-${Date.now()}`);
});

afterEach(async () => {
  await app.close();
  await harness.drop();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ErrorDetails = { code: string; path: string; message?: string };

type ErrorBody = {
  error: {
    code: string;
    message?: string;
    details?: ErrorDetails[];
  };
};

/** Create a document and return its id. */
async function createDoc(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: { cookie },
    payload: buildCreatePayload(),
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { id: string }).id;
}

/** Create a document with one line and return { docId, lineId }. */
async function createDocWithLine(): Promise<{ docId: string; lineId: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: { cookie },
    payload: {
      ...buildCreatePayload(),
      lines: [buildLinePayload()],
    },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { id: string; lines: Array<{ id: string }> };
  const firstLine = body.lines[0];
  if (!firstLine) throw new Error('Expected at least one line after document creation');
  return { docId: body.id, lineId: firstLine.id };
}

// ---------------------------------------------------------------------------
// Document-level validation codes
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('document-level validation codes', () => {
  it('TITLE_REQUIRED at path title', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: { ...buildCreatePayload(), title: '' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'TITLE_REQUIRED', path: 'title' }),
    );
  });

  it('CUSTOMER_REQUIRED at path customer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: { ...buildCreatePayload(), customer: '' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'CUSTOMER_REQUIRED', path: 'customer' }),
    );
  });

  it('ISSUE_DATE_INVALID for malformed date', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: { ...buildCreatePayload(), issueDate: '08/13/2026' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'ISSUE_DATE_INVALID', path: 'issueDate' }),
    );
  });

  it('ISSUE_DATE_INVALID for non-date string', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: { ...buildCreatePayload(), issueDate: 'not-a-date' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'ISSUE_DATE_INVALID', path: 'issueDate' }),
    );
  });

  it('DOCUMENT_NOT_FOUND at root for a non-existent id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/documents/000000000000000000000000',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('DOCUMENT_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Line-level validation codes (schema boundary — via POST /documents with bad line)
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('line-level schema validation codes', () => {
  it('DESCRIPTION_REQUIRED at path lines.0.description', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: {
        ...buildCreatePayload(),
        lines: [{ ...buildLinePayload(), description: '' }],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'DESCRIPTION_REQUIRED', path: 'lines.0.description' }),
    );
  });

  it('DESCRIPTION_REQUIRED at path lines.0.description when the field is omitted entirely', async () => {
    const { description: _description, ...lineWithoutDescription } = buildLinePayload();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: {
        ...buildCreatePayload(),
        lines: [lineWithoutDescription],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'DESCRIPTION_REQUIRED', path: 'lines.0.description' }),
    );
  });

  it('DESCRIPTION_REQUIRED at path lines.0.description on whole-array PATCH when the field is omitted', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: buildCreatePayload(),
    });
    const { id } = createRes.json() as { id: string };

    const { description: _description, ...lineWithoutDescription } = buildLinePayload();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${id}`,
      headers: { cookie },
      payload: { lines: [lineWithoutDescription] },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'DESCRIPTION_REQUIRED', path: 'lines.0.description' }),
    );
  });

  it('QUANTITY_TOO_LOW at path lines.0.quantity', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: {
        ...buildCreatePayload(),
        lines: [{ ...buildLinePayload(), quantity: 0 }],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'QUANTITY_TOO_LOW', path: 'lines.0.quantity' }),
    );
  });

  it('UNIT_PRICE_NEGATIVE at path lines.0.unitPrice', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: {
        ...buildCreatePayload(),
        lines: [{ ...buildLinePayload(), unitPrice: -0.01 }],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'UNIT_PRICE_NEGATIVE', path: 'lines.0.unitPrice' }),
    );
  });

  it('TAX_PERCENT_OUT_OF_RANGE at path lines.0.taxPercent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: {
        ...buildCreatePayload(),
        lines: [{ ...buildLinePayload(), taxPercent: 100.01 }],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'TAX_PERCENT_OUT_OF_RANGE', path: 'lines.0.taxPercent' }),
    );
  });

  it('DISCOUNT_PERCENT_OUT_OF_RANGE at path lines.0.discount.value', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: {
        ...buildCreatePayload(),
        lines: [{ ...buildLinePayload(), discount: { type: 'percent', value: 100.01 } }],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'DISCOUNT_PERCENT_OUT_OF_RANGE', path: 'lines.0.discount.value' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Engine-level error codes (DISCOUNT_EXCEEDS_SUBTOTAL)
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('engine-level error codes', () => {
  it('DISCOUNT_EXCEEDS_SUBTOTAL at path lines.0.discount.value — via POST /documents', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: {
        ...buildCreatePayload(),
        lines: [
          {
            description: 'Expensive Item',
            quantity: 1,
            unitPrice: 10.0,
            discount: { type: 'fixed', value: 20.0 }, // $20 discount on a $10 line
            taxPercent: null,
          },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'DISCOUNT_EXCEEDS_SUBTOTAL', path: 'lines.0.discount.value' }),
    );
  });

  it('DISCOUNT_EXCEEDS_SUBTOTAL at path lines.0.discount.value — via PATCH /documents/:id', async () => {
    const docId = await createDoc();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${docId}`,
      headers: { cookie },
      payload: {
        lines: [
          {
            description: 'Expensive Item',
            quantity: 1,
            unitPrice: 10.0,
            discount: { type: 'fixed', value: 20.0 },
            taxPercent: null,
          },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'DISCOUNT_EXCEEDS_SUBTOTAL', path: 'lines.0.discount.value' }),
    );
  });

  it('DISCOUNT_EXCEEDS_SUBTOTAL at path lines.0.discount.value — via POST /documents/:id/lines', async () => {
    const docId = await createDoc();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${docId}/lines`,
      headers: { cookie },
      payload: {
        description: 'Expensive Item',
        quantity: 1,
        unitPrice: 10.0,
        discount: { type: 'fixed', value: 20.0 },
        taxPercent: null,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'DISCOUNT_EXCEEDS_SUBTOTAL', path: 'lines.0.discount.value' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Server-managed field codes
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('server-managed field rejection', () => {
  it('SERVER_MANAGED_FIELD at path totals — POST /documents', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: {
        ...buildCreatePayload(),
        totals: { subtotal: 0, totalDiscount: 0, totalTax: 0, grandTotal: 0 },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'SERVER_MANAGED_FIELD', path: 'totals' }),
    );
  });

  it('SERVER_MANAGED_FIELD at path status — POST /documents', async () => {
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
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'SERVER_MANAGED_FIELD', path: 'status' }),
    );
  });

  it('SERVER_MANAGED_FIELD at path totals — PATCH /documents/:id', async () => {
    const docId = await createDoc();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${docId}`,
      headers: { cookie },
      payload: { totals: { subtotal: 999, totalDiscount: 0, totalTax: 0, grandTotal: 999 } },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'SERVER_MANAGED_FIELD', path: 'totals' }),
    );
  });

  it('SERVER_MANAGED_FIELD at path status — PATCH /documents/:id', async () => {
    const docId = await createDoc();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${docId}`,
      headers: { cookie },
      payload: { status: 'finalized' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'SERVER_MANAGED_FIELD', path: 'status' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Line-not-found code
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('LINE_NOT_FOUND', () => {
  it('LINE_NOT_FOUND at root for a non-existent line id — PATCH', async () => {
    const docId = await createDoc();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${docId}/lines/non-existent-line-id`,
      headers: { cookie },
      payload: { description: 'Updated' },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('LINE_NOT_FOUND');
  });

  it('LINE_NOT_FOUND at root for a non-existent line id — DELETE', async () => {
    const docId = await createDoc();

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/documents/${docId}/lines/non-existent-line-id`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('LINE_NOT_FOUND');
  });
});
