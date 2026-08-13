import { describe, expect, it, vi } from 'vitest';
import { summarizeReports } from './reports.ts';
import type { ReportsRepository } from '../persistence/reports.repository.ts';
import type { ReportAggregate } from '../persistence/reports.repository.ts';

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
});
