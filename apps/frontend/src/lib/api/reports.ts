import { apiFetch } from './client';
import type { ReportSummary } from './types/report';

/**
 * Fetches the summary report for the given inclusive issueDate range.
 *
 * Both ends are optional at the HTTP level, but the report UI always supplies
 * them. When both are absent the bare path is called.
 */
export function summary(from?: string, to?: string): Promise<ReportSummary> {
  const query = new URLSearchParams();

  if (from) {
    query.set('from', from);
  }
  if (to) {
    query.set('to', to);
  }

  const queryString = query.toString();
  return apiFetch<ReportSummary>(
    `/api/v1/reports/summary${queryString ? `?${queryString}` : ''}`,
  );
}
