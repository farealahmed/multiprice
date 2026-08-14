/** @jsxRuntime automatic */
/** @jsxImportSource react */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Money } from '@/components/money/Money';
import { StatusPill } from '@/components/documents/StatusPill';
import { Topbar } from '@/components/shell/Topbar';
import { ApiError } from '@/lib/api/client';
import { duplicate } from '@/lib/api/lifecycle';
import { preview } from '@/lib/api/pricing';
import type { DocumentResponse, LineItemResponse } from '@/lib/api/types/document';
import type { DocumentResult, LineInput } from '@/lib/api/types/pricing';

import { StatusBanner } from './StatusBanner';
import styles from './lifecycle.module.css';

function toLineInput(line: LineItemResponse): LineInput {
  return {
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discount: line.discount,
    taxPercent: line.taxPercent,
  };
}

function formatDiscount(discount: LineItemResponse['discount']): string {
  if (discount.type === 'none') {
    return '—';
  }
  if (discount.type === 'percent') {
    return `${discount.value} %`;
  }
  return `$${discount.value.toFixed(2)}`;
}

function formatTaxPercent(taxPercent: number | null): string {
  return taxPercent === null ? '—' : String(taxPercent);
}

type DocumentViewProps = {
  document: DocumentResponse;
};

/**
 * Read-only record view for a finalized document. Renders metadata and line
 * items as plain text, not as a disabled form (R16). Per-line computed figures
 * come from the same server-side preview call the editor uses; the API is the
 * only immutability enforcement point, and this view reflects that state.
 */
export function DocumentView({ document }: DocumentViewProps) {
  const router = useRouter();
  const [result, setResult] = useState<DocumentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    preview(document.lines.map(toLineInput)).then(
      (computed) => {
        if (!active) {
          return;
        }
        setResult(computed);
        setLoading(false);
      },
      (err: unknown) => {
        if (!active) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Totals could not be loaded.');
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [document]);

  const handleDuplicate = async () => {
    setDuplicating(true);
    setDuplicateError(null);
    try {
      const copy = await duplicate(document.id);
      router.push(`/documents/${copy.id}`);
    } catch (err) {
      setDuplicateError(
        err instanceof ApiError ? err.message : 'Failed to duplicate document. Please try again.',
      );
      setDuplicating(false);
    }
  };

  return (
    <>
      <Topbar />
      <main className={`page ${styles.wide}`}>
        <header className={styles.pageHead}>
          <div>
            <div className="kicker">Document</div>
            <h1>{document.title || 'Untitled document'}</h1>
            <p className={styles.lede}>
              <StatusPill status={document.status} /> — read-only. Totals were
              computed server-side and are now locked.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.button}
              disabled={duplicating}
              onClick={() => void handleDuplicate()}
            >
              {duplicating ? 'Duplicating…' : 'Duplicate as draft'}
            </button>
            <Link className={styles.back} href={`/documents/${document.id}/print`}>
              Print
            </Link>
            <Link className={styles.back} href="/documents">
              ← Back to documents
            </Link>
          </div>
        </header>

        {duplicateError !== null && (
          <p className={styles.actionError} role="alert">
            {duplicateError}
          </p>
        )}

        <StatusBanner>
          <strong>Locked.</strong> Lines, amounts, and metadata cannot be edited.
        </StatusBanner>

        <section className={styles.panel} aria-labelledby="details-heading">
          <h2 className={styles.sectionLabel} id="details-heading">
            Details
          </h2>
          <div className={styles.metadata}>
            <div className={styles.metadataField}>
              <label>Title</label>
              <div className={styles.metadataValue}>{document.title}</div>
            </div>
            <div className={styles.metadataField}>
              <label>Customer</label>
              <div className={styles.metadataValue}>{document.customer}</div>
            </div>
            <div className={styles.metadataField}>
              <label>Issue date</label>
              <div className={styles.metadataValue}>{document.issueDate}</div>
            </div>
            <div className={styles.metadataField}>
              <label>Status</label>
              <div className={styles.metadataValue}>
                <StatusPill status={document.status} />
              </div>
            </div>
          </div>
        </section>

        <div className={styles.sectionLabel}>Line items</div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colIndex} scope="col">
                #
              </th>
              <th scope="col">Description</th>
              <th className={`${styles.headNum} ${styles.colQty}`} scope="col">
                Qty
              </th>
              <th className={`${styles.headNum} ${styles.colPrice}`} scope="col">
                Unit price
              </th>
              <th className={styles.colDiscount} scope="col">
                Discount
              </th>
              <th className={`${styles.headNum} ${styles.colTax}`} scope="col">
                Tax %
              </th>
              <th className={`${styles.headNum} ${styles.colMoney}`} scope="col">
                Subtotal
              </th>
              <th className={`${styles.headNum} ${styles.colMoney}`} scope="col">
                Disc. amt
              </th>
              <th className={`${styles.headNum} ${styles.colMoney}`} scope="col">
                After disc.
              </th>
              <th className={`${styles.headNum} ${styles.colMoney}`} scope="col">
                Tax amt
              </th>
              <th className={`${styles.headNum} ${styles.colTotal}`} scope="col">
                Line total
              </th>
            </tr>
          </thead>
          <tbody>
            {document.lines.map((line, index) => {
              const lineResult = result?.lines[index];
              return (
                <tr key={line.id}>
                  <td className={styles.numCell}>{index + 1}</td>
                  <td>{line.description}</td>
                  <td className={styles.numCell}>{line.quantity}</td>
                  <td className={styles.numCell}>${line.unitPrice.toFixed(2)}</td>
                  <td>{formatDiscount(line.discount)}</td>
                  <td className={styles.numCell}>{formatTaxPercent(line.taxPercent)}</td>
                  <td className={styles.resultCell}>
                    {lineResult ? `$${lineResult.subtotal.toFixed(2)}` : '—'}
                  </td>
                  <td className={styles.resultCell}>
                    {lineResult ? `$${lineResult.discountAmount.toFixed(2)}` : '—'}
                  </td>
                  <td className={styles.resultCell}>
                    {lineResult ? `$${lineResult.afterDiscount.toFixed(2)}` : '—'}
                  </td>
                  <td className={styles.resultCell}>
                    {lineResult ? `$${lineResult.taxAmount.toFixed(2)}` : '—'}
                  </td>
                  <td className={`${styles.resultCell} ${styles.lineTotal}`}>
                    {lineResult ? `$${lineResult.total.toFixed(2)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {error !== null && (
          <p className={styles.lede} role="alert">
            {error}
          </p>
        )}
        {loading && <p role="status">Loading line totals…</p>}

        <hr className={styles.rule} />

        <div className={styles.footerRow}>
          <div className={styles.grow} />
          <div className={styles.totals}>
            <div className={styles.sectionLabel}>Document totals</div>
            <div className={styles.trow}>
              <span className={styles.tl}>Subtotal</span>
              <span className={styles.tv}>
                $<Money value={document.totals.subtotal} />
              </span>
            </div>
            <div className={styles.trow}>
              <span className={styles.tl}>Total discount</span>
              <span className={styles.tv}>
                − $<Money value={document.totals.totalDiscount} />
              </span>
            </div>
            <div className={styles.trow}>
              <span className={styles.tl}>Total tax</span>
              <span className={styles.tv}>
                + $<Money value={document.totals.totalTax} />
              </span>
            </div>
            <div className={`${styles.trow} ${styles.grand}`}>
              <span className={styles.tl}>Grand total</span>
              <span className={styles.tv}>
                $<Money value={document.totals.grandTotal} />
              </span>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
