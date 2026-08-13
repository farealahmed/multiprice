/** @jsxRuntime automatic */
/** @jsxImportSource react */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { Topbar } from '@/components/shell/Topbar';
import { RangePicker, type DateRange } from '@/components/report/RangePicker';
import { StatCards } from '@/components/report/StatCards';
import { ReportTable } from '@/components/report/ReportTable';
import * as reports from '@/lib/api/reports';
import * as documents from '@/lib/api/documents';
import { ApiError } from '@/lib/api/client';
import type { ReportSummary } from '@/lib/api/types/report';
import type { DocumentSummary } from '@/lib/api/types/document';
import styles from './report.module.css';

type PageState =
  | { phase: 'loading' }
  | { phase: 'ok'; summary: ReportSummary; docs: DocumentSummary[] }
  | { phase: 'error'; message: string };

function firstDayOfCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function lastDayOfCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const last = new Date(year, month + 1, 0);
  const day = String(last.getDate()).padStart(2, '0');
  const monthStr = String(last.getMonth() + 1).padStart(2, '0');
  return `${last.getFullYear()}-${monthStr}-${day}`;
}

export default function ReportPage() {
  const [pageState, setPageState] = useState<PageState>({ phase: 'loading' });

  const load = useCallback(async (range: DateRange) => {
    setPageState({ phase: 'loading' });
    try {
      const [summary, docs] = await Promise.all([
        reports.summary(range.from, range.to),
        documents.list(range),
      ]);
      setPageState({ phase: 'ok', summary, docs });
    } catch (err) {
      setPageState({
        phase: 'error',
        message:
          err instanceof ApiError
            ? err.message
            : 'Failed to load report. Please try again.',
      });
    }
  }, []);

  useEffect(() => {
    void load({ from: firstDayOfCurrentMonth(), to: lastDayOfCurrentMonth() });
  }, [load]);

  const handleRetry = () => {
    void load({ from: firstDayOfCurrentMonth(), to: lastDayOfCurrentMonth() });
  };

  return (
    <>
      <Topbar />
      <main className="page">
        <div className={styles.pageHead}>
          <div className={styles.kicker}>Reporting</div>
          <h1 className={styles.heading}>Summary report</h1>
          <p className={styles.lede}>
            Aggregates across documents by issue-date range. Reported totals
            always reconcile with the individual documents in range.
          </p>
        </div>

        <RangePicker
          onRun={load}
          disabled={pageState.phase === 'loading'}
        />

        {pageState.phase === 'loading' && (
          <div className={styles.state}>Loading…</div>
        )}

        {pageState.phase === 'error' && (
          <div className={styles.state}>
            <p>{pageState.message}</p>
            <button
              type="button"
              className={styles.retryBtn}
              onClick={handleRetry}
            >
              Try again
            </button>
          </div>
        )}

        {pageState.phase === 'ok' && pageState.docs.length === 0 && (
          <div className={styles.empty}>
            <h2 className={styles.emptyHeading}>No documents issued</h2>
            <p className={styles.emptyBody}>
              No documents issued between {pageState.summary.from} and{' '}
              {pageState.summary.to}.
            </p>
          </div>
        )}

        {pageState.phase === 'ok' && pageState.docs.length > 0 && (
          <>
            <StatCards summary={pageState.summary} />
            <div className={styles.sectionLabel}>Documents in range</div>
            <ReportTable docs={pageState.docs} />
          </>
        )}
      </main>
    </>
  );
}
