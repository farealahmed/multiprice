/** @jsxRuntime automatic */
/** @jsxImportSource react */
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';

import { Field } from '@/components/forms/Field';
import { FinalizeDialog } from '@/components/lifecycle/FinalizeDialog';
import { DocumentTotals } from '@/components/line-items/DocumentTotals';
import { LineItemsTable } from '@/components/line-items/LineItemsTable';
import { emptyRow, toLineInputs, type RowState } from '@/components/line-items/row-state';
import { Topbar } from '@/components/shell/Topbar';
import { ApiError } from '@/lib/api/client';
import { get, update } from '@/lib/api/documents';
import { finalize } from '@/lib/api/lifecycle';
import { preview } from '@/lib/api/pricing';
import type { DocumentResponse, DocumentTotals as PersistedTotals, LineItemInput } from '@/lib/api/types/document';
import { DOCUMENT_FINALIZED } from '@/lib/api/types/lifecycle';
import type { DocumentResult } from '@/lib/api/types/pricing';

import { mapDocumentErrors, type DocumentEditorErrors } from './error-mapping';
import styles from './document-editor.module.css';

type TotalsSource =
  | { kind: 'live' }
  | { kind: 'persisted'; totals: PersistedTotals };

function rowsFromDocument(document: DocumentResponse): RowState[] {
  return document.lines.map((line, index) => ({
    id: line.id,
    key: `row-${index}`,
    description: line.description,
    quantity: String(line.quantity),
    unitPrice: String(line.unitPrice),
    discountType: line.discount.type,
    discountValue: line.discount.type === 'none' ? '' : String(line.discount.value),
    taxPercent: line.taxPercent === null ? '' : String(line.taxPercent),
  }));
}

function toDocumentLines(rows: RowState[]): LineItemInput[] | null {
  const inputs = toLineInputs(rows);
  if (inputs === null) {
    return null;
  }

  return inputs.map((input, index) => {
    const row = rows[index]!;
    return { ...input, id: row.id, description: row.description };
  });
}

function totalResult(source: TotalsSource, liveResult: DocumentResult | null): DocumentResult | undefined {
  if (source.kind === 'persisted') {
    return { lines: [], ...source.totals };
  }
  return liveResult ?? undefined;
}

type DocumentEditorProps = {
  documentId: string;
  /** If provided, the editor seeds from this document instead of re-fetching. */
  initialDocument?: DocumentResponse;
  /** Called when this document becomes finalized (successfully or via a 409 race). */
  onFinalized?: (document?: DocumentResponse) => void;
};

export function DocumentEditor({ documentId, initialDocument, onFinalized }: DocumentEditorProps) {
  const nextKey = useRef(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [customer, setCustomer] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [status, setStatus] = useState<DocumentResponse['status']>('draft');
  const [rows, setRows] = useState<RowState[]>([]);
  const [liveResult, setLiveResult] = useState<DocumentResult | null>(null);
  const [totalsSource, setTotalsSource] = useState<TotalsSource>({ kind: 'live' });
  const [errors, setErrors] = useState<DocumentEditorErrors | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [staleFinalizedMessage, setStaleFinalizedMessage] = useState<string | null>(null);

  const applyDocument = useCallback((document: DocumentResponse) => {
    nextKey.current = document.lines.length;
    setTitle(document.title);
    setCustomer(document.customer);
    setIssueDate(document.issueDate);
    setStatus(document.status);
    setRows(rowsFromDocument(document));
    setLiveResult(null);
    setTotalsSource({ kind: 'live' });
    setErrors(null);
    setDirty(false);
    setLoaded(true);
    setLoading(false);
  }, []);

  const loadDocument = useCallback(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    get(documentId).then(
      (document) => {
        if (!active) {
          return;
        }
        applyDocument(document);
      },
      (error: unknown) => {
        if (!active) {
          return;
        }
        setLoaded(false);
        setLoadError(error instanceof Error ? error.message : 'Document could not be loaded.');
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [documentId, applyDocument]);

  useEffect(() => {
    if (initialDocument) {
      applyDocument(initialDocument);
      return;
    }
    return loadDocument();
  }, [applyDocument, initialDocument, loadDocument]);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    const lines = toLineInputs(rows);
    if (lines === null) {
      setPreviewPending(false);
      return;
    }

    let active = true;
    setPreviewPending(true);
    preview(lines).then(
      (result) => {
        if (!active) {
          return;
        }
        setLiveResult(result);
        setErrors(null);
        setPreviewPending(false);
      },
      (error: unknown) => {
        if (!active) {
          return;
        }
        setErrors(
          error instanceof ApiError
            ? mapDocumentErrors(error.details, rows.length, error.message)
            : mapDocumentErrors(undefined, rows.length, 'Totals could not be computed — is the backend running?'),
        );
        setPreviewPending(false);
      },
    );
    return () => {
      active = false;
    };
  }, [loaded, rows]);

  useEffect(() => {
    if (!dirty) {
      return;
    }

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  const markDirty = () => {
    setDirty(true);
    setTotalsSource({ kind: 'live' });
    setErrors(null);
  };

  const updateRow = (key: string, patch: Partial<RowState>) => {
    markDirty();
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    markDirty();
    const key = `row-${nextKey.current}`;
    nextKey.current += 1;
    setRows((current) => [...current, emptyRow(key)]);
  };

  const removeRow = (key: string) => {
    markDirty();
    setRows((current) => current.filter((row) => row.key !== key));
  };

  const save = async () => {
    const lines = toDocumentLines(rows);
    if (lines === null) {
      setErrors(mapDocumentErrors(undefined, rows.length, 'Complete every numeric line field before saving.'));
      return;
    }

    setSaving(true);
    setErrors(null);
    setStaleFinalizedMessage(null);
    try {
      const document = await update(documentId, { title, customer, issueDate, lines });
      setTitle(document.title);
      setCustomer(document.customer);
      setIssueDate(document.issueDate);
      setStatus(document.status);
      setRows((current) =>
        current.map((row, index) => ({ ...row, id: document.lines[index]?.id ?? row.id })),
      );
      setTotalsSource({ kind: 'persisted', totals: document.totals });
      setDirty(false);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === DOCUMENT_FINALIZED) {
        // The document was finalized elsewhere while this tab was editing.
        // Surface a clear message, then hand control back to the parent so it
        // can switch to the read-only view without discarding the user's edits
        // silently and without leaving the save spinner stuck.
        setStaleFinalizedMessage(
          'This document has been finalized in another session. Your unsaved changes were not saved. Switching to read-only view…',
        );
        setSaving(false);
        window.setTimeout(() => {
          onFinalized?.();
        }, 1500);
        return;
      }
      setErrors(
        error instanceof ApiError
          ? mapDocumentErrors(error.details, rows.length, error.message)
          : mapDocumentErrors(undefined, rows.length, 'Document could not be saved.'),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (dirty) {
      // Defensive: the finalize control is disabled while dirty, but this
      // guards confirmation too in case the dialog is reached some other way.
      setFinalizeError('Save your changes before finalizing.');
      return;
    }
    setFinalizeError(null);
    try {
      const finalized = await finalize(documentId);
      setFinalizeOpen(false);
      onFinalized?.(finalized);
    } catch (error: unknown) {
      setFinalizeError(
        error instanceof ApiError
          ? error.message
          : 'Document could not be finalized.',
      );
    }
  };

  const confirmNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    if (dirty && !window.confirm('Discard unsaved changes?')) {
      event.preventDefault();
    }
  };

  if (loading) {
    return (
      <>
        <Topbar />
        <main className={`page ${styles.wide}`}>
          <p role="status">Loading document…</p>
        </main>
      </>
    );
  }

  if (loadError !== null) {
    return (
      <>
        <Topbar />
        <main className={`page ${styles.wide}`}>
          <p role="alert">{loadError}</p>
          <button className={styles.button} type="button" onClick={loadDocument}>
            Try again
          </button>
        </main>
      </>
    );
  }

  const note = previewPending
    ? totalsSource.kind === 'persisted'
      ? 'Saved totals shown while line figures refresh.'
      : 'Recalculating…'
    : undefined;

  return (
    <>
      <Topbar />
      <main className={`page ${styles.wide}`}>
        <header className={styles.pageHead}>
          <div>
            <div className="kicker">Document</div>
            <h1>{title || 'Untitled document'}</h1>
            <p className="lede">
              <span className={styles.status} data-status={status}>
                {status}
              </span>{' '}
              — fully editable. All totals are computed server-side.
            </p>
          </div>
          <Link className={styles.back} href="/documents" onClick={confirmNavigation}>
            ← Back to documents
          </Link>
        </header>

        <section className={styles.panel} aria-labelledby="details-heading">
          <h2 className={styles.sectionLabel} id="details-heading">
            Details
          </h2>
          <div className={styles.metadata}>
            <Field
              id="document-title"
              label="Title"
              value={title}
              error={errors?.metadata.title}
              disabled={saving}
              onChange={(event) => {
                markDirty();
                setTitle(event.target.value);
              }}
            />
            <Field
              id="document-customer"
              label="Customer"
              value={customer}
              error={errors?.metadata.customer}
              disabled={saving}
              onChange={(event) => {
                markDirty();
                setCustomer(event.target.value);
              }}
            />
            <Field
              id="document-issue-date"
              label="Issue date"
              type="date"
              value={issueDate}
              error={errors?.metadata.issueDate}
              disabled={saving}
              onChange={(event) => {
                markDirty();
                setIssueDate(event.target.value);
              }}
            />
            <Field id="document-status" label="Status" value={status} disabled readOnly />
          </div>
        </section>

        <div className={styles.sectionLabel}>
          Line items · discount before tax · percent <i>or</i> fixed, never both
        </div>
        <LineItemsTable
          rows={rows}
          results={liveResult?.lines}
          errors={errors?.rows}
          pending={previewPending}
          disabled={saving}
          onChange={updateRow}
          onRemove={removeRow}
        />
        <div className={styles.buttonRow}>
          <button className={styles.buttonSmall} type="button" disabled={saving} onClick={addRow}>
            + Add line
          </button>
          <span className={styles.hint}>A fixed discount cannot exceed the line subtotal.</span>
        </div>

        <hr className={styles.rule} />

        <div className={styles.footerRow}>
          <div className={styles.grow}>
            {errors !== null && errors.documentLevel.length > 0 && (
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
            )}
          </div>
          <div className={styles.totals}>
            <DocumentTotals result={totalResult(totalsSource, liveResult)} pending={previewPending} note={note} />
            <div className={styles.buttonRow}>
              <button
                className={styles.buttonPrimary}
                disabled={saving || dirty}
                title={dirty ? 'Save your changes before finalizing.' : undefined}
                type="button"
                onClick={() => setFinalizeOpen(true)}
              >
                Finalize document
              </button>
              <button className={styles.button} disabled={saving} type="button" onClick={save}>
                {saving ? 'Saving…' : 'Save draft'}
              </button>
            </div>
            {dirty && (
              <p className={styles.hint} role="note">
                Save your changes before finalizing — finalizing locks the last saved version.
              </p>
            )}
          </div>
        </div>

        {staleFinalizedMessage !== null && (
          <div className={styles.notice} role="alert" style={{ marginTop: 24 }}>
            <span aria-hidden="true" className={styles.noticeSquare} />
            <span>
              <b className={styles.noticeMessage}>{staleFinalizedMessage}</b>
            </span>
          </div>
        )}

        {finalizeOpen && (
          <FinalizeDialog
            title={title}
            error={finalizeError ?? undefined}
            onConfirm={handleFinalize}
            onCancel={() => {
              setFinalizeOpen(false);
              setFinalizeError(null);
            }}
          />
        )}
      </main>
    </>
  );
}
