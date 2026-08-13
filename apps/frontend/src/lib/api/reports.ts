import { apiFetch } from './client';
import type { ReportSummary } from './types/report';

export function summary(from: string, to: string): Promise<ReportSummary> {
  const query = new URLSearchParams({ from, to });

  return apiFetch<ReportSummary>(`/api/v1/reports/summary?${query.toString()}`);
}
