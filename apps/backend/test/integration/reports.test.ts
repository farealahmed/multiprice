/**
 * T6 — Reconciliation & aggregation evidence suite.
 *
 * Scored acceptance: "summary totals match individual documents in range."
 *
 * Seeds documents via the real HTTP API (factories), lists them through
 * `GET /documents?from=&to=`, sums their grandTotal/totalTax/totalDiscount
 * **in the test itself**, and asserts exact equality (to the cent) against
 * `GET /reports/summary`'s response for the identical range.
 *
 * Written blind against T1's contract (contracts/report.ts) and
 * docs/contracts/phase-5.md — expected red until T5 lands.
 *
 * Verifies: R10, R14, R15, R16, R17, R18, R19
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

const pdfSampleDocumentLines = pdfSampleLines.map((line, index) => ({
  ...line,
  description: ['Widget A', 'Widget B', 'Service fee'][index]!,
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

type Session = { cookie: string; userId: string };

/** Register two users and return their session cookies + user ids. */
async function twoUsers(): Promise<{ alice: Session; bob: Session }> {
  const [aliceCookie, bobCookie] = await Promise.all([
    createAuthenticatedUser(app, 'alice'),
    createAuthenticatedUser(app, 'bob'),
  ]);

  async function me(cookie: string): Promise<string> {
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    return (res.json() as { id: string }).id;
  }

  const [aliceUserId, bobUserId] = await Promise.all([me(aliceCookie), me(bobCookie)]);
  return {
    alice: { cookie: aliceCookie, userId: aliceUserId },
    bob: { cookie: bobCookie, userId: bobUserId },
  };
}

type DocSummary = {
  id: string;
  title: string;
  customer: string;
  issueDate: string;
  status: 'draft' | 'finalized';
  totals: { subtotal: number; totalDiscount: number; totalTax: number; grandTotal: number };
};

type ReportSummary = {
  from: string;
  to: string;
  documentCount: number;
  totalGrandTotal: number;
  totalTax: number;
  totalDiscount: number;
};

/**
 * Seed one document via the API and return its summary.
 * Uses pdf-sample lines when `withLines` is true.
 */
async function seedDocument(
  cookie: string,
  issueDate: string,
  withLines = false,
): Promise<DocSummary> {
  const payload: Record<string, unknown> = {
    ...buildCreatePayload({ issueDate }),
    ...(withLines ? { lines: pdfSampleDocumentLines } : {}),
  };

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: { cookie },
    payload,
  });
  expect(res.statusCode).toBe(201);
  const doc = res.json() as { id: string };

  // Fetch the summary so we have totals.
  const getRes = await app.inject({
    method: 'GET',
    url: `/api/v1/documents/${doc.id}`,
    headers: { cookie },
  });
  expect(getRes.statusCode).toBe(200);
  return getRes.json() as DocSummary;
}

/** Finalize a document by id. */
async function finalizeDocument(cookie: string, docId: string): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/documents/${docId}/finalize`,
    headers: { cookie },
  });
  expect(res.statusCode).toBe(200);
}

// ---------------------------------------------------------------------------
// Reconciliation — the deliverable (R14)
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)(
  'report totals exactly equal the sum of the documents listed for the same range',
  () => {
    it(
      'reconciles with pdf-sample non-trivial numbers',
      async () => {
        const { alice } = await twoUsers();

        // Seed two documents in July using pdf-sample lines for non-trivial figures.
        const doc1 = await seedDocument(alice.cookie, '2026-07-01', true);
        const doc2 = await seedDocument(alice.cookie, '2026-07-15', true);

        const from = '2026-07-01';
        const to = '2026-07-31';

        // List documents in range.
        const listRes = await app.inject({
          method: 'GET',
          url: `/api/v1/documents?from=${from}&to=${to}`,
          headers: { cookie: alice.cookie },
        });
        expect(listRes.statusCode).toBe(200);
        const listed = listRes.json() as DocSummary[];

        // Sum in the test itself — not re-implementing the aggregation.
        const summedCount = listed.length;
        const summedGrandTotal = listed.reduce((sum, d) => sum + d.totals.grandTotal, 0);
        const summedTax = listed.reduce((sum, d) => sum + d.totals.totalTax, 0);
        const summedDiscount = listed.reduce((sum, d) => sum + d.totals.totalDiscount, 0);

        // Report for the same range.
        const reportRes = await app.inject({
          method: 'GET',
          url: `/api/v1/reports/summary?from=${from}&to=${to}`,
          headers: { cookie: alice.cookie },
        });
        expect(reportRes.statusCode).toBe(200);
        const report = reportRes.json() as ReportSummary;

        // Exact equality to the cent.
        expect(report.documentCount).toBe(summedCount);
        expect(report.totalGrandTotal).toBe(summedGrandTotal);
        expect(report.totalTax).toBe(summedTax);
        expect(report.totalDiscount).toBe(summedDiscount);
      },
    );

    it('reconciles a single document', async () => {
      const { alice } = await twoUsers();
      await seedDocument(alice.cookie, '2026-07-10', true);

      const from = '2026-07-01';
      const to = '2026-07-31';

      const listRes = await app.inject({
        method: 'GET',
        url: `/api/v1/documents?from=${from}&to=${to}`,
        headers: { cookie: alice.cookie },
      });
      expect(listRes.statusCode).toBe(200);
      const listed = listRes.json() as DocSummary[];

      const reportRes = await app.inject({
        method: 'GET',
        url: `/api/v1/reports/summary?from=${from}&to=${to}`,
        headers: { cookie: alice.cookie },
      });
      expect(reportRes.statusCode).toBe(200);
      const report = reportRes.json() as ReportSummary;

      expect(report.documentCount).toBe(listed.length);
      expect(listed[0]).toBeDefined();
      expect(report.totalGrandTotal).toBe(listed[0]!.totals.grandTotal);
      expect(report.totalTax).toBe(listed[0]!.totals.totalTax);
      expect(report.totalDiscount).toBe(listed[0]!.totals.totalDiscount);
    });
  },
);

// ---------------------------------------------------------------------------
// Boundaries (R3, R15)
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('date range boundaries are inclusive', () => {
  it('a document issued exactly on `from` is included', async () => {
    const { alice } = await twoUsers();
    const doc = await seedDocument(alice.cookie, '2026-07-01', true);

    const reportRes = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/summary?from=2026-07-01&to=2026-07-31',
      headers: { cookie: alice.cookie },
    });
    expect(reportRes.statusCode).toBe(200);
    const report = reportRes.json() as ReportSummary;

    expect(report.documentCount).toBe(1);
    expect(report.totalGrandTotal).toBe(doc.totals.grandTotal);
  });

  it('a document issued exactly on `to` is included', async () => {
    const { alice } = await twoUsers();
    const doc = await seedDocument(alice.cookie, '2026-07-31', true);

    const reportRes = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/summary?from=2026-07-01&to=2026-07-31',
      headers: { cookie: alice.cookie },
    });
    expect(reportRes.statusCode).toBe(200);
    const report = reportRes.json() as ReportSummary;

    expect(report.documentCount).toBe(1);
    expect(report.totalGrandTotal).toBe(doc.totals.grandTotal);
  });

  it('a document issued the day before `from` is excluded', async () => {
    const { alice } = await twoUsers();
    await seedDocument(alice.cookie, '2026-06-30', true);

    const reportRes = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/summary?from=2026-07-01&to=2026-07-31',
      headers: { cookie: alice.cookie },
    });
    expect(reportRes.statusCode).toBe(200);
    const report = reportRes.json() as ReportSummary;

    expect(report.documentCount).toBe(0);
    expect(report.totalGrandTotal).toBe(0);
  });

  it('a document issued the day after `to` is excluded', async () => {
    const { alice } = await twoUsers();
    await seedDocument(alice.cookie, '2026-08-01', true);

    const reportRes = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/summary?from=2026-07-01&to=2026-07-31',
      headers: { cookie: alice.cookie },
    });
    expect(reportRes.statusCode).toBe(200);
    const report = reportRes.json() as ReportSummary;

    expect(report.documentCount).toBe(0);
    expect(report.totalGrandTotal).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Isolation (R16)
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)(
  'another user\'s documents never contribute to count or sums',
  () => {
    it('user A sees only their own totals — user B\'s documents are invisible', async () => {
      const { alice, bob } = await twoUsers();

      // Alice creates one document.
      const aliceDoc = await seedDocument(alice.cookie, '2026-07-10', true);

      // Bob creates a document with much larger totals in the same range.
      // Use the pdf sample's grandTotal (42150 cents) plus a large offset for bob.
      const bobPayload: Record<string, unknown> = {
        ...buildCreatePayload({ issueDate: '2026-07-12' }),
        lines: pdfSampleDocumentLines.map((line) => ({
          ...line,
          // Make bob's totals significantly larger so any leak is unmistakable.
          unitPrice: 9999,
        })),
      };
      const bobRes = await app.inject({
        method: 'POST',
        url: '/api/v1/documents',
        headers: { cookie: bob.cookie },
        payload: bobPayload,
      });
      expect(bobRes.statusCode).toBe(201);

      const reportRes = await app.inject({
        method: 'GET',
        url: '/api/v1/reports/summary?from=2026-07-01&to=2026-07-31',
        headers: { cookie: alice.cookie },
      });
      expect(reportRes.statusCode).toBe(200);
      const report = reportRes.json() as ReportSummary;

      // Alice's report must reflect only her document — never Bob's.
      expect(report.documentCount).toBe(1);
      expect(report.totalGrandTotal).toBe(aliceDoc.totals.grandTotal);
      expect(report.totalTax).toBe(aliceDoc.totals.totalTax);
      expect(report.totalDiscount).toBe(aliceDoc.totals.totalDiscount);
    });
  },
);

// ---------------------------------------------------------------------------
// Draft inclusion (R5, R17)
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('drafts are included in the report', () => {
  it('a mixed draft/finalized range still reconciles', async () => {
    const { alice } = await twoUsers();

    // Draft document — created by seedDocument (no explicit finalize).
    const draft = await seedDocument(alice.cookie, '2026-07-05', true);

    // Finalized document.
    const finalized = await seedDocument(alice.cookie, '2026-07-20', true);
    await finalizeDocument(alice.cookie, finalized.id);

    const from = '2026-07-01';
    const to = '2026-07-31';

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/documents?from=${from}&to=${to}`,
      headers: { cookie: alice.cookie },
    });
    expect(listRes.statusCode).toBe(200);
    const listed = listRes.json() as DocSummary[];

    expect(listed).toHaveLength(2);

    const summedGrandTotal = listed.reduce((sum, d) => sum + d.totals.grandTotal, 0);
    const summedTax = listed.reduce((sum, d) => sum + d.totals.totalTax, 0);
    const summedDiscount = listed.reduce((sum, d) => sum + d.totals.totalDiscount, 0);

    const reportRes = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/summary?from=${from}&to=${to}`,
      headers: { cookie: alice.cookie },
    });
    expect(reportRes.statusCode).toBe(200);
    const report = reportRes.json() as ReportSummary;

    expect(report.documentCount).toBe(2);
    expect(report.totalGrandTotal).toBe(summedGrandTotal);
    expect(report.totalTax).toBe(summedTax);
    expect(report.totalDiscount).toBe(summedDiscount);
  });

  it('a range containing only drafts still returns 200 with correct zeros', async () => {
    const { alice } = await twoUsers();

    // Create two drafts only — do not finalize either.
    await seedDocument(alice.cookie, '2026-07-03', true);
    await seedDocument(alice.cookie, '2026-07-18', true);

    const reportRes = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/summary?from=2026-07-01&to=2026-07-31',
      headers: { cookie: alice.cookie },
    });
    expect(reportRes.statusCode).toBe(200);
    const report = reportRes.json() as ReportSummary;

    // Both drafts must be included.
    expect(report.documentCount).toBe(2);
    expect(report.totalGrandTotal).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Overlapping ranges (R18)
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)(
  'a single document in two overlapping ranges contributes fully to each',
  () => {
    it('document in the overlap is fully counted in both ranges', async () => {
      const { alice } = await twoUsers();

      // One document in the middle.
      const doc = await seedDocument(alice.cookie, '2026-07-15', true);

      const range1From = '2026-07-01';
      const range1To = '2026-07-20';
      const range2From = '2026-07-15';
      const range2To = '2026-07-31';

      const [report1Res, report2Res] = await Promise.all([
        app.inject({
          method: 'GET',
          url: `/api/v1/reports/summary?from=${range1From}&to=${range1To}`,
          headers: { cookie: alice.cookie },
        }),
        app.inject({
          method: 'GET',
          url: `/api/v1/reports/summary?from=${range2From}&to=${range2To}`,
          headers: { cookie: alice.cookie },
        }),
      ]);

      expect(report1Res.statusCode).toBe(200);
      expect(report2Res.statusCode).toBe(200);

      const report1 = report1Res.json() as ReportSummary;
      const report2 = report2Res.json() as ReportSummary;

      // Both ranges include the doc; neither splits or discounts it.
      expect(report1.documentCount).toBe(1);
      expect(report1.totalGrandTotal).toBe(doc.totals.grandTotal);
      expect(report2.documentCount).toBe(1);
      expect(report2.totalGrandTotal).toBe(doc.totals.grandTotal);
    });
  },
);

// ---------------------------------------------------------------------------
// Empty range (R10, R19)
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('an empty range returns zeros, not 404', () => {
  it('a range with no documents returns 200 with all zeros', async () => {
    const { alice } = await twoUsers();

    // Create a document outside the empty range.
    await seedDocument(alice.cookie, '2026-06-15', true);

    const reportRes = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/summary?from=2026-07-01&to=2026-07-31',
      headers: { cookie: alice.cookie },
    });
    expect(reportRes.statusCode).toBe(200);
    const report = reportRes.json() as ReportSummary;

    expect(report.documentCount).toBe(0);
    expect(report.totalGrandTotal).toBe(0);
    expect(report.totalTax).toBe(0);
    expect(report.totalDiscount).toBe(0);
  });

  it('empty range still returns the queried dates in the response', async () => {
    const { alice } = await twoUsers();

    const reportRes = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/summary?from=2026-08-01&to=2026-08-31',
      headers: { cookie: alice.cookie },
    });
    expect(reportRes.statusCode).toBe(200);
    const report = reportRes.json() as ReportSummary;

    expect(report.from).toBe('2026-08-01');
    expect(report.to).toBe('2026-08-31');
  });
});

// ---------------------------------------------------------------------------
// No-range regression guard — backend (ARCH Open Questions item)
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)(
  'GET /documents with no range still returns every document, unfiltered',
  () => {
    it('no from/to returns all documents', async () => {
      const { alice } = await twoUsers();

      // Seed documents across two months.
      await seedDocument(alice.cookie, '2026-06-15', true);
      await seedDocument(alice.cookie, '2026-07-01', true);
      await seedDocument(alice.cookie, '2026-07-31', true);
      await seedDocument(alice.cookie, '2026-08-01', true);

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/documents',
        headers: { cookie: alice.cookie },
      });
      expect(listRes.statusCode).toBe(200);
      const listed = listRes.json() as DocSummary[];

      // All four documents must be returned.
      expect(listed).toHaveLength(4);
    });

    it('with no range the count equals total documents in the db for that user', async () => {
      const { alice, bob } = await twoUsers();

      // Alice: 3 documents.
      await seedDocument(alice.cookie, '2026-07-05', true);
      await seedDocument(alice.cookie, '2026-07-10', true);
      await seedDocument(alice.cookie, '2026-07-20', true);

      // Bob: 1 document.
      await seedDocument(bob.cookie, '2026-07-15', true);

      const aliceListRes = await app.inject({
        method: 'GET',
        url: '/api/v1/documents',
        headers: { cookie: alice.cookie },
      });
      expect(aliceListRes.statusCode).toBe(200);
      const aliceListed = aliceListRes.json() as DocSummary[];

      // Alice must see only her 3, not Bob's.
      expect(aliceListed).toHaveLength(3);
    });
  },
);
