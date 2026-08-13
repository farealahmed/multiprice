import { describe, expect, it } from 'vitest';
import { ObjectId, type Collection, type Db } from 'mongodb';

import type { StoredDocument } from '../domain/document.ts';
import { createReportsRepository, type ReportAggregate } from './reports.repository.ts';

function createFakeCollection() {
  const aggregatePipelines: unknown[] = [];
  let aggregateResult: unknown[] = [];

  const collection = {
    aggregate: <T>(_pipeline: unknown[]) => {
      aggregatePipelines.push(_pipeline);
      return {
        toArray: async () => aggregateResult as T[],
      };
    },
  } as unknown as Collection<StoredDocument>;

  return {
    collection,
    aggregatePipelines,
    setAggregateResult(result: unknown[]) {
      aggregateResult = result;
    },
  };
}

function createFakeDb(collection: Collection<StoredDocument>): Db {
  return { collection: () => collection } as unknown as Db;
}

describe('reports.repository', () => {
  it('calls aggregate with ownerId inside $match and sums persisted totals in $group', async () => {
    const { collection, aggregatePipelines } = createFakeCollection();
    const db = createFakeDb(collection);
    const reports = createReportsRepository(db);

    await reports.summarize('owner-1', { from: '2026-07-01', to: '2026-07-31' });

    expect(aggregatePipelines).toHaveLength(1);
    const pipeline = aggregatePipelines[0] as Array<{ $match?: unknown; $group?: unknown }>;
    expect(pipeline[0]?.$match).toEqual({
      ownerId: 'owner-1',
      issueDate: { $gte: '2026-07-01', $lte: '2026-07-31' },
    });
    expect(pipeline[1]?.$group).toEqual({
      _id: null,
      documentCount: { $sum: 1 },
      totalGrandTotal: { $sum: '$totals.grandTotal' },
      totalTax: { $sum: '$totals.totalTax' },
      totalDiscount: { $sum: '$totals.totalDiscount' },
    });
  });

  it('places ownerId only inside $match, never as a post-filter stage', async () => {
    const { collection, aggregatePipelines } = createFakeCollection();
    const db = createFakeDb(collection);
    const reports = createReportsRepository(db);

    await reports.summarize('owner-1', { from: '2026-07-01', to: '2026-07-31' });

    const pipeline = aggregatePipelines[0] as Array<{ $match?: unknown; $group?: unknown }>;
    expect(pipeline).toHaveLength(2);
    expect(JSON.stringify(pipeline)).toContain('ownerId');
    expect(pipeline[0]?.$match).toEqual(
      expect.objectContaining({ ownerId: 'owner-1' }),
    );
  });

  it('returns the fake aggregate result verbatim', async () => {
    const { collection, setAggregateResult } = createFakeCollection();
    const db = createFakeDb(collection);
    const reports = createReportsRepository(db);

    setAggregateResult([
      {
        documentCount: 2,
        totalGrandTotal: 742678,
        totalTax: 27458,
        totalDiscount: 40180,
      },
    ]);

    const result = await reports.summarize('owner-1', { from: '2026-07-01', to: '2026-07-31' });

    expect(result).toEqual({
      documentCount: 2,
      totalGrandTotal: 742678,
      totalTax: 27458,
      totalDiscount: 40180,
    });
  });

  it('returns zeros when the aggregation matches nothing', async () => {
    const { collection } = createFakeCollection();
    const db = createFakeDb(collection);
    const reports = createReportsRepository(db);

    const result = await reports.summarize('owner-1', { from: '2026-07-01', to: '2026-07-31' });

    expect(result).toEqual({
      documentCount: 0,
      totalGrandTotal: 0,
      totalTax: 0,
      totalDiscount: 0,
    });
  });

  it('zero-fills when another owner owns all matching documents', async () => {
    const { collection, setAggregateResult } = createFakeCollection();
    const db = createFakeDb(collection);
    const reports = createReportsRepository(db);

    setAggregateResult([]);

    const result = await reports.summarize('owner-1', { from: '2026-07-01', to: '2026-07-31' });

    expect(result.documentCount).toBe(0);
    expect(result.totalGrandTotal).toBe(0);
    expect(result.totalTax).toBe(0);
    expect(result.totalDiscount).toBe(0);
  });

  it('derives report totals and rows from one $facet aggregation', async () => {
    const { collection, aggregatePipelines } = createFakeCollection();
    const reports = createReportsRepository(createFakeDb(collection));

    await reports.view('owner-1', { from: '2026-07-01', to: '2026-07-31' });

    const pipeline = aggregatePipelines[0] as Array<{ $match?: unknown; $facet?: unknown }>;
    expect(pipeline).toHaveLength(2);
    expect(pipeline[0]?.$match).toEqual({
      ownerId: 'owner-1',
      issueDate: { $gte: '2026-07-01', $lte: '2026-07-31' },
    });
    expect(pipeline[1]?.$facet).toEqual({
      summary: [
        {
          $group: {
            _id: null,
            documentCount: { $sum: 1 },
            totalGrandTotal: { $sum: '$totals.grandTotal' },
            totalTax: { $sum: '$totals.totalTax' },
            totalDiscount: { $sum: '$totals.totalDiscount' },
          },
        },
      ],
      documents: [{ $sort: { issueDate: -1, createdAt: -1 } }],
    });
  });
});
