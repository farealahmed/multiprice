/** @jsxRuntime automatic */
/** @jsxImportSource react */
'use client';

import { useState } from 'react';
import styles from './report.module.css';

export type DateRange = {
  from: string;
  to: string;
};

type RangePickerProps = {
  defaultRange?: DateRange;
  onRun: (range: DateRange) => void;
  disabled?: boolean;
};

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

/**
 * Date-range selector for the summary report.
 *
 * Defaults to the current calendar month and blocks `from > to` inline before
 * the parent ever fires a request.
 */
export function RangePicker({ defaultRange, onRun, disabled }: RangePickerProps) {
  const [from, setFrom] = useState(defaultRange?.from ?? firstDayOfCurrentMonth());
  const [to, setTo] = useState(defaultRange?.to ?? lastDayOfCurrentMonth());
  const [error, setError] = useState<string | null>(null);

  const handleRun = () => {
    if (from > to) {
      setError('From date must be on or before the to date.');
      return;
    }
    setError(null);
    onRun({ from, to });
  };

  return (
    <div className={styles.panel}>
      <div className={styles.sectionLabel}>Date range · issue date</div>
      <div className={styles.rangeRow}>
        <div className={styles.fields}>
          <label htmlFor="report-from">
            From
            <input
              id="report-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              disabled={disabled}
            />
          </label>
          <label htmlFor="report-to">
            To
            <input
              id="report-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={disabled}
            />
          </label>
          <button
            type="button"
            className={styles.btn}
            onClick={handleRun}
            disabled={disabled}
          >
            Run report <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
      {error && <p className={styles.fieldError}>{error}</p>}
      <p className={styles.rangeNote}>
        Both draft and finalized documents are included. Both dates are inclusive.
      </p>
    </div>
  );
}
