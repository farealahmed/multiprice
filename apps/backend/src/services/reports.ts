import type { DocumentSummary } from '../contracts/document.ts';
import type { ReportSummary } from '../contracts/report.ts';
import type { ReportAggregate, ReportsRepository } from '../persistence/reports.repository.ts';
import { toDocumentSummary } from './documents.ts';

export type ReportView = ReportSummary & {
  documents: DocumentSummary[];
};

function toReportSummary(
  aggregate: ReportAggregate,
  range: { from?: string; to?: string },
): ReportSummary {
  return {
    from: range.from ?? '',
    to: range.to ?? '',
    documentCount: aggregate.documentCount,
    totalGrandTotal: aggregate.totalGrandTotal / 100,
    totalTax: aggregate.totalTax / 100,
    totalDiscount: aggregate.totalDiscount / 100,
  };
}

/** Orchestrates the summary report, converting aggregate cents to major units. */
export async function summarizeReports(
  ownerId: string,
  range: { from?: string; to?: string },
  repository: ReportsRepository,
): Promise<ReportSummary> {
  return toReportSummary(await repository.summarize(ownerId, range), range);
}

/**
 * Returns report totals and rows from the same aggregation input stream.
 */
export async function getReportView(
  ownerId: string,
  range: { from?: string; to?: string },
  repository: ReportsRepository,
): Promise<ReportView> {
  const view = await repository.view(ownerId, range);
  const aggregate = view.summary[0] ?? {
    documentCount: 0,
    totalGrandTotal: 0,
    totalTax: 0,
    totalDiscount: 0,
  };

  return {
    ...toReportSummary(aggregate, range),
    documents: view.documents.map(toDocumentSummary),
  };
}
