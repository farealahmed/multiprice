/** @jsxRuntime automatic */
/** @jsxImportSource react */
'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { DocumentView } from '@/components/lifecycle/DocumentView';
import { Topbar } from '@/components/shell/Topbar';
import { ApiError } from '@/lib/api/client';
import { get } from '@/lib/api/documents';
import type { DocumentResponse } from '@/lib/api/types/document';

import styles from '@/components/lifecycle/lifecycle.module.css';

export default function DocumentViewPage() {
  const params = useParams<{ id: string }>();
  const [state, setState] = useState<
    | { phase: 'loading' }
    | { phase: 'ok'; document: DocumentResponse }
    | { phase: 'error'; message: string }
  >({ phase: 'loading' });

  // Tracks the id the most recently issued request is for, so a late response
  // for a document the user has since navigated away from can't overwrite the
  // state of the id now on screen.
  const requestedIdRef = useRef<string | null>(null);

  const load = useCallback(() => {
    const id = params.id;
    requestedIdRef.current = id;
    setState({ phase: 'loading' });
    get(id).then(
      (document) => {
        if (requestedIdRef.current !== id) return;
        setState({ phase: 'ok', document });
      },
      (error: unknown) => {
        if (requestedIdRef.current !== id) return;
        setState({
          phase: 'error',
          message:
            error instanceof ApiError
              ? error.message
              : 'Document could not be loaded.',
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

  return <DocumentView document={state.document} />;
}
