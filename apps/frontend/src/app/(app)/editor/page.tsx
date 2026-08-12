/** @jsxRuntime automatic */
/** @jsxImportSource react */
'use client';

import { useEffect, useRef, useState } from 'react';

import { DocumentTotals } from '@/components/line-items/DocumentTotals';
import { LineItemsTable } from '@/components/line-items/LineItemsTable';
import { mapApiError, type MappedPricingErrors } from '@/components/line-items/error-mapping';
import { emptyRow, toLineInputs, type RowState } from '@/components/line-items/row-state';
import { Topbar } from '@/components/shell/Topbar';
import { ApiError } from '@/lib/api/client';
import { preview } from '@/lib/api/pricing';
import type { DocumentResult } from '@/lib/api/types/pricing';

import styles from './editor.module.css';

export default function EditorPage() {
  const nextKey = useRef(1);
  const hasResult = useRef(false);
  const [rows, setRows] = useState<RowState[]>(() => [emptyRow('row-0')]);
  const [result, setResult] = useState<DocumentResult | null>(null);
  const [errors, setErrors] = useState<MappedPricingErrors | null>(null);
  // True whenever the numbers on screen are not the server's answer to the
  // inputs on screen: debounced, in flight, mid-edit, or last rejected.
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (rows.length === 0) {
      hasResult.current = false;
      setResult(null);
      setErrors(null);
      setPending(false);
      return;
    }

    const lines = toLineInputs(rows);
    if (lines === null) {
      setPending(hasResult.current);
      return;
    }

    setPending(true);
    let active = true;
    preview(lines).then(
      (document) => {
        if (!active) {
          return;
        }
        hasResult.current = true;
        setResult(document);
        setErrors(null);
        setPending(false);
      },
      (error: unknown) => {
        if (!active) {
          return;
        }
        setPending(hasResult.current);
        setErrors(
          error instanceof ApiError
            ? mapApiError(error, rows.length)
            : {
                rows: new Map(),
                documentLevel: ['Totals could not be computed — is the backend running?'],
              },
        );
      },
    );
    return () => {
      active = false;
    };
  }, [rows]);

  const updateRow = (key: string, patch: Partial<RowState>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    const key = `row-${nextKey.current}`;
    nextKey.current += 1;
    setRows((current) => [...current, emptyRow(key)]);
  };

  const removeRow = (key: string) => {
    setRows((current) => current.filter((row) => row.key !== key));
  };

  const note = pending
    ? errors === null
      ? 'Recalculating…'
      : 'Showing the last totals the server accepted.'
    : undefined;

  return (
    <>
      <Topbar />
      <main className={`page ${styles.wide}`}>
        <div className={styles.pageHead}>
          <div className="kicker">Document · live preview</div>
          <h1>Line items editor</h1>
          <p className="lede">
            All totals are computed server-side; this form never decides the numbers.
          </p>
        </div>

        <div className={styles.sectionLabel}>
          Line items · discount before tax · percent <i>or</i> fixed, never both
        </div>
        <LineItemsTable
          rows={rows}
          results={result?.lines}
          errors={errors?.rows}
          pending={pending}
          onChange={updateRow}
          onRemove={removeRow}
        />
        <div className={styles.btnrow}>
          <button className={styles.btnSmall} type="button" onClick={addRow}>
            + Add line
          </button>
          <span className={styles.hint}>A fixed discount cannot exceed the line subtotal.</span>
        </div>

        <hr className={styles.rule} />

        <div className={styles.split}>
          <div className={styles.grow}>
            {errors !== null && errors.documentLevel.length > 0 && (
              <>
                <div className={styles.sectionLabel}>Validation</div>
                <div className={styles.notice} role="alert">
                  <span aria-hidden="true" className={styles.noticeSquare} />
                  <span>
                    {errors.documentLevel.map((message, index) => (
                      <b key={`${index}-${message}`} className={styles.noticeMessage}>
                        {message}
                      </b>
                    ))}
                  </span>
                </div>
              </>
            )}
          </div>
          <DocumentTotals result={result ?? undefined} pending={pending} note={note} />
        </div>
      </main>
    </>
  );
}
