import { apiFetch } from './client';
import type { DateRangeQuery, ReportSummary, ReportView } from './types/report';

function withRange(path: string, range: DateRangeQuery): string {
  const query = new URLSearchParams();

  if (range.from) {
    query.set('from', range.from);
  }
  if (range.to) {
    query.set('to', range.to);
  }

  const queryString = query.toString();
  return `${path}${queryString ? `?${queryString}` : ''}`;
}

/** Fetches the summary report for the given inclusive issue-date range. */
export function summary(from?: string, to?: string): Promise<ReportSummary> {
  return apiFetch<ReportSummary>(withRange('/api/v1/reports/summary', { from, to }));
}

/** Fetches report totals and rows from one server-side aggregation. */
export function view(range: DateRangeQuery): Promise<ReportView> {
  return apiFetch<ReportView>(withRange('/api/v1/reports/view', range));
}
