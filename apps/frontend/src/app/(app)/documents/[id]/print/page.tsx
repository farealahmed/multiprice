/** @jsxRuntime automatic */
/** @jsxImportSource react */
'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { PrintDocument } from '@/components/print/PrintDocument';
import printStyles from '@/components/print/PrintDocument.module.css';
import { Topbar } from '@/components/shell/Topbar';
import { ApiError } from '@/lib/api/client';
import { get } from '@/lib/api/documents';
import { preview } from '@/lib/api/pricing';
import type { DocumentResponse } from '@/lib/api/types/document';
import type { DocumentResult } from '@/lib/api/types/pricing';

import styles from '@/components/lifecycle/lifecycle.module.css';

type PrintState =
  | { phase: 'loading' }
  | { phase: 'ok'; document: DocumentResponse; result: DocumentResult }
  | { phase: 'error'; message: string };

export default function PrintDocumentPage() {
  const params = useParams<{ id: string }>();
  const [state, setState] = useState<PrintState>({ phase: 'loading' });
  const requestedIdRef = useRef<string | null>(null);

  const load = useCallback(() => {
    const id = params.id;
    requestedIdRef.current = id;
    setState({ phase: 'loading' });

    get(id).then(
      (document) =>
        preview(
          document.lines.map((line) => ({
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discount: line.discount,
            taxPercent: line.taxPercent,
          })),
        ).then(
          (result) => {
            if (requestedIdRef.current !== id) return;
            setState({ phase: 'ok', document, result });
          },
          (error: unknown) => {
            if (requestedIdRef.current !== id) return;
            setState({
              phase: 'error',
              message:
                error instanceof ApiError ? error.message : 'Document could not be loaded.',
            });
          },
        ),
      (error: unknown) => {
        if (requestedIdRef.current !== id) return;
        setState({
          phase: 'error',
          message: error instanceof ApiError ? error.message : 'Document could not be loaded.',
        });
      },
    );
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.phase === 'loading') {
    return (
      <>
        <Topbar />
        <main className={`page ${styles.wide}`}>
          <p role="status">Loading document…</p>
        </main>
      </>
    );
  }

  if (state.phase === 'error') {
    return (
      <>
        <Topbar />
        <main className={`page ${styles.wide}`}>
          <p role="alert">{state.message}</p>
          <button className={styles.button} type="button" onClick={load}>
            Try again
          </button>
        </main>
      </>
    );
  }

  return (
    <div className={printStyles.root}>
      <Topbar />
      <PrintDocument document={state.document} result={state.result} />
    </div>
  );
}
