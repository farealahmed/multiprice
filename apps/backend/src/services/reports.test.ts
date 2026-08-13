import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';

import { getReportView, summarizeReports } from './reports.ts';
import type { StoredDocument } from '../domain/document.ts';
import type { ReportAggregate, ReportsRepository } from '../persistence/reports.repository.ts';

function createFakeReportsRepository(
  aggregate: ReportAggregate,
): {
  repository: ReportsRepository;
  calls: Parameters<ReportsRepository['summarize']>[];
} {
  const calls: Parameters<ReportsRepository['summarize']>[] = [];

  const repository: ReportsRepository = {
    summarize: async (ownerId, range) => {
      calls.push([ownerId, range]);
      return aggregate;
    },
    view: async () => ({ summary: [], documents: [] }),
  };

  return { repository, calls };
}

describe('reports service — summarizeReports', () => {
  it('converts each summed money field from cents to major units, dividing once', async () => {
    const { repository } = createFakeReportsRepository({
      documentCount: 2,
      totalGrandTotal: 742_678,
      totalTax: 27_458,
      totalDiscount: 40_180,
    });

    const result = await summarizeReports(
      'owner-1',
      { from: '2026-07-01', to: '2026-07-31' },
      repository,
    );

    expect(result.totalGrandTotal).toBe(7_426.78);
    expect(result.totalTax).toBe(274.58);
    expect(result.totalDiscount).toBe(401.8);
  });

  it('never divides documentCount', async () => {
    const { repository } = createFakeReportsRepository({
      documentCount: 0,
      totalGrandTotal: 0,
      totalTax: 0,
      totalDiscount: 0,
    });

    const result = await summarizeReports(
      'owner-1',
      { from: '2026-07-01', to: '2026-07-31' },
      repository,
    );

    expect(result.documentCount).toBe(0);
  });

  it('echoes from and to verbatim from the validated input', async () => {
    const { repository } = createFakeReportsRepository({
      documentCount: 1,
      totalGrandTotal: 100,
      totalTax: 10,
      totalDiscount: 5,
    });

    const result = await summarizeReports(
      'owner-1',
      { from: '2026-07-01', to: '2026-07-31' },
      repository,
    );

    expect(result.from).toBe('2026-07-01');
    expect(result.to).toBe('2026-07-31');
  });

  it('calls repository.summarize once with unmodified ownerId and range', async () => {
    const { repository, calls } = createFakeReportsRepository({
      documentCount: 3,
      totalGrandTotal: 300,
      totalTax: 30,
      totalDiscount: 15,
    });
    const range = { from: '2026-07-01', to: '2026-07-31' };

    await summarizeReports('owner-42', range, repository);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(['owner-42', range]);
  });

  it('maps totals and rows from the same repository view result', async () => {
    const id = new ObjectId();
    const stored: StoredDocument = {
      _id: id,
      ownerId: 'owner-1',
      title: 'July invoice',
      customer: 'Acme',
      issueDate: '2026-07-15',
      status: 'draft',
      lines: [],
      totals: { subtotal: 10_000, totalDiscount: 500, totalTax: 950, grandTotal: 10_450 },
      createdAt: new Date('2026-07-15T00:00:00.000Z'),
      updatedAt: new Date('2026-07-15T00:00:00.000Z'),
    };
    const repository: ReportsRepository = {
      summarize: async () => {
        throw new Error('summary must not be queried separately');
      },
      view: async () => ({
        summary: [{
          documentCount: 1,
          totalGrandTotal: 10_450,
          totalTax: 950,
          totalDiscount: 500,
        }],
        documents: [stored],
      }),
    };

    const result = await getReportView(
      'owner-1',
      { from: '2026-07-01', to: '2026-07-31' },
      repository,
    );

    expect(result).toMatchObject({
      from: '2026-07-01',
      to: '2026-07-31',
      documentCount: 1,
      totalGrandTotal: 104.5,
      totalTax: 9.5,
      totalDiscount: 5,
      documents: [{
        id: id.toHexString(),
        title: 'July invoice',
        totals: { subtotal: 100, totalDiscount: 5, totalTax: 9.5, grandTotal: 104.5 },
      }],
    });
  });
});
