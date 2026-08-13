/**
 * T6 — Summary report reconciliation and aggregation evidence suite.
 *
 * Seeds documents through the real HTTP API, lists them through the amended
 * `GET /api/v1/documents` route, sums their persisted totals in the test itself,
 * and asserts exact equality (to the cent) against `GET /api/v1/reports/summary`
 * for the identical range.
 *
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
import { pdfSampleLines } from '../fixtures/pdf-sample.ts';

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
// Types
// ---------------------------------------------------------------------------

type DocumentSummary = {
  id: string;
  title: string;
  customer: string;
  issueDate: string;
  status: 'draft' | 'finalized';
  totals: {
    subtotal: number;
    totalDiscount: number;
    totalTax: number;
    grandTotal: number;
  };
};

type ReportSummary = {
  from: string;
  to: string;
  documentCount: number;
  totalGrandTotal: number;
  totalTax: number;
  totalDiscount: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createDocument(
  cookie: string,
  issueDate: string,
  lines: unknown[] = [buildLinePayload()],
): Promise<DocumentSummary> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: { cookie },
    payload: {
      ...buildCreatePayload(),
      issueDate,
      lines,
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as DocumentSummary;
}

async function finalizeDocument(cookie: string, id: string): Promise<DocumentSummary> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/documents/${id}/finalize`,
    headers: { cookie },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as DocumentSummary;
}

async function listDocuments(
  cookie: string,
  range?: { from: string; to: string },
): Promise<DocumentSummary[]> {
  const query = range ? `?from=${range.from}&to=${range.to}` : '';
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/documents${query}`,
    headers: { cookie },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as DocumentSummary[];
}

async function fetchReport(
  cookie: string,
  range?: { from: string; to: string },
): Promise<ReportSummary> {
  const query = range ? `?from=${range.from}&to=${range.to}` : '';
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/reports/summary${query}`,
    headers: { cookie },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as ReportSummary;
}

function toCents(major: number): number {
  return Math.round(major * 100);
}

function sumDocuments(docs: DocumentSummary[]) {
  return docs.reduce(
    (acc, doc) => ({
      grandTotal: acc.grandTotal + toCents(doc.totals.grandTotal),
      totalTax: acc.totalTax + toCents(doc.totals.totalTax),
      totalDiscount: acc.totalDiscount + toCents(doc.totals.totalDiscount),
    }),
    { grandTotal: 0, totalTax: 0, totalDiscount: 0 },
  );
}

function expectReportMatchesDocuments(
  report: ReportSummary,
  docs: DocumentSummary[],
): void {
  const expected = sumDocuments(docs);
  expect(report.documentCount).toBe(docs.length);
  expect(toCents(report.totalGrandTotal)).toBe(expected.grandTotal);
  expect(toCents(report.totalTax)).toBe(expected.totalTax);
  expect(toCents(report.totalDiscount)).toBe(expected.totalDiscount);
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('GET /api/v1/reports/summary reconciliation', () => {
  it('report totals exactly equal the sum of the documents listed for the same range', async () => {
    const cookie = await createAuthenticatedUser(app, 'recon');

    const july = { from: '2026-07-01', to: '2026-07-31' };
    await createDocument(cookie, '2026-07-10', pdfSampleLines);
    await createDocument(cookie, '2026-07-20', [buildLinePayload({ quantity: 3, unitPrice: 75.0 })]);

    const listed = await listDocuments(cookie, july);
    const report = await fetchReport(cookie, july);

    expectReportMatchesDocuments(report, listed);
  });

  it('includes a document issued exactly on from', async () => {
    const cookie = await createAuthenticatedUser(app, 'boundary-from');
    const range = { from: '2026-07-01', to: '2026-07-31' };

    await createDocument(cookie, '2026-06-30');
    await createDocument(cookie, '2026-07-01');

    const listed = await listDocuments(cookie, range);
    const report = await fetchReport(cookie, range);

    expect(listed).toHaveLength(1);
    expect(listed[0]!.issueDate).toBe('2026-07-01');
    expectReportMatchesDocuments(report, listed);
  });

  it('includes a document issued exactly on to', async () => {
    const cookie = await createAuthenticatedUser(app, 'boundary-to');
    const range = { from: '2026-07-01', to: '2026-07-31' };

    await createDocument(cookie, '2026-07-31');
    await createDocument(cookie, '2026-08-01');

    const listed = await listDocuments(cookie, range);
    const report = await fetchReport(cookie, range);

    expect(listed).toHaveLength(1);
    expect(listed[0]!.issueDate).toBe('2026-07-31');
    expectReportMatchesDocuments(report, listed);
  });

  it('excludes a document issued the day before from', async () => {
    const cookie = await createAuthenticatedUser(app, 'before-from');
    const range = { from: '2026-07-01', to: '2026-07-31' };

    await createDocument(cookie, '2026-06-30');

    const listed = await listDocuments(cookie, range);
    const report = await fetchReport(cookie, range);

    expect(listed).toHaveLength(0);
    expect(report.documentCount).toBe(0);
    expect(report.totalGrandTotal).toBe(0);
  });

  it('excludes a document issued the day after to', async () => {
    const cookie = await createAuthenticatedUser(app, 'after-to');
    const range = { from: '2026-07-01', to: '2026-07-31' };

    await createDocument(cookie, '2026-08-01');

    const listed = await listDocuments(cookie, range);
    const report = await fetchReport(cookie, range);

    expect(listed).toHaveLength(0);
    expect(report.documentCount).toBe(0);
    expect(report.totalGrandTotal).toBe(0);
  });

  it('never includes another user\'s documents in count or sums', async () => {
    const aliceCookie = await createAuthenticatedUser(app, 'iso-alice');
    const bobCookie = await createAuthenticatedUser(app, 'iso-bob');
    const range = { from: '2026-07-01', to: '2026-07-31' };

    // Bob has the larger total.
    await createDocument(bobCookie, '2026-07-15', [
      buildLinePayload({ quantity: 100, unitPrice: 100.0 }),
    ]);

    // Alice has a small total.
    const aliceDoc = await createDocument(aliceCookie, '2026-07-10', [
      buildLinePayload({ quantity: 1, unitPrice: 10.0 }),
    ]);

    const aliceListed = await listDocuments(aliceCookie, range);
    const aliceReport = await fetchReport(aliceCookie, range);

    expect(aliceListed).toHaveLength(1);
    expect(aliceListed[0]!.id).toBe(aliceDoc.id);
    expectReportMatchesDocuments(aliceReport, aliceListed);
    expect(toCents(aliceReport.totalGrandTotal)).toBeLessThan(100_000);
  });

  it('includes drafts and finalized documents, and the mixed set reconciles', async () => {
    const cookie = await createAuthenticatedUser(app, 'draft-mixed');
    const range = { from: '2026-07-01', to: '2026-07-31' };

    const draft = await createDocument(cookie, '2026-07-05');
    const finalized = await createDocument(cookie, '2026-07-20');
    await finalizeDocument(cookie, finalized.id);

    const listed = await listDocuments(cookie, range);
    const report = await fetchReport(cookie, range);

    const statuses = new Set(listed.map((d) => d.status));
    expect(statuses).toContain('draft');
    expect(statuses).toContain('finalized');
    expectReportMatchesDocuments(report, listed);
  });

  it('counts a document fully in two overlapping ranges', async () => {
    const cookie = await createAuthenticatedUser(app, 'overlap');

    const doc = await createDocument(cookie, '2026-07-15');

    const firstRange = { from: '2026-07-01', to: '2026-07-31' };
    const secondRange = { from: '2026-07-15', to: '2026-08-15' };

    const firstListed = await listDocuments(cookie, firstRange);
    const firstReport = await fetchReport(cookie, firstRange);
    const secondListed = await listDocuments(cookie, secondRange);
    const secondReport = await fetchReport(cookie, secondRange);

    expect(firstListed).toHaveLength(1);
    expect(secondListed).toHaveLength(1);
    expect(firstListed[0]!.id).toBe(doc.id);
    expect(secondListed[0]!.id).toBe(doc.id);
    expectReportMatchesDocuments(firstReport, firstListed);
    expectReportMatchesDocuments(secondReport, secondListed);
  });

  it('returns zeros, not 404, for an empty range', async () => {
    const cookie = await createAuthenticatedUser(app, 'empty');
    const range = { from: '2026-07-01', to: '2026-07-31' };

    await createDocument(cookie, '2026-06-15');

    const listed = await listDocuments(cookie, range);
    const report = await fetchReport(cookie, range);

    expect(listed).toHaveLength(0);
    expect(report).toMatchObject({
      from: range.from,
      to: range.to,
      documentCount: 0,
      totalGrandTotal: 0,
      totalTax: 0,
      totalDiscount: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// No-range regression
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('GET /api/v1/documents — no-range regression', () => {
  it('returns every document when no range is provided', async () => {
    const cookie = await createAuthenticatedUser(app, 'no-range');

    await createDocument(cookie, '2026-06-15');
    await createDocument(cookie, '2026-07-15');
    await createDocument(cookie, '2026-08-15');

    const listed = await listDocuments(cookie);

    expect(listed).toHaveLength(3);
    const dates = listed.map((d) => d.issueDate).sort();
    expect(dates).toEqual(['2026-06-15', '2026-07-15', '2026-08-15']);
  });
});

// ---------------------------------------------------------------------------
// Range validation errors
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('GET /api/v1/reports/summary validation', () => {
  it('rejects from > to with DATE_RANGE_INVERTED', async () => {
    const cookie = await createAuthenticatedUser(app, 'inverted');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/summary?from=2026-07-31&to=2026-07-01',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string; details: Array<{ code: string; path: string[] }> } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toEqual(
      expect.arrayContaining([{ code: 'DATE_RANGE_INVERTED', path: ['to'] }]),
    );
  });

  it('rejects a malformed date with DATE_RANGE_INVALID', async () => {
    const cookie = await createAuthenticatedUser(app, 'invalid-date');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/summary?from=07/01/2026',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string; details: Array<{ code: string; path: string[] }> } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toEqual(
      expect.arrayContaining([{ code: 'DATE_RANGE_INVALID', path: ['from'] }]),
    );
  });
});
