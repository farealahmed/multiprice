/** @jsxRuntime automatic */
/** @jsxImportSource react */
'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

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

  const load = useCallback(() => {
    setState({ phase: 'loading' });
    get(params.id).then(
      (document) => setState({ phase: 'ok', document }),
      (error: unknown) =>
        setState({
          phase: 'error',
          message:
            error instanceof ApiError
              ? error.message
              : 'Document could not be loaded.',
        }),
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
