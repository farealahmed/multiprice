import type { ReportsRepository } from '../persistence/reports.repository.ts';
import type { ReportSummary } from '../contracts/report.ts';

/**
 * Orchestrates the summary report.
 *
 * - Delegates aggregation to the reports repository (cents scale).
 * - Converts summed money fields to major units exactly once.
 * - Echoes the already-validated `from`/`to` range back in the response.
 */
export async function summarizeReports(
  ownerId: string,
  range: { from?: string; to?: string },
  repository: ReportsRepository,
): Promise<ReportSummary> {
  const aggregate = await repository.summarize(ownerId, range);

  return {
    from: range.from ?? '',
    to: range.to ?? '',
    documentCount: aggregate.documentCount,
    totalGrandTotal: aggregate.totalGrandTotal / 100,
    totalTax: aggregate.totalTax / 100,
    totalDiscount: aggregate.totalDiscount / 100,
  };
}
