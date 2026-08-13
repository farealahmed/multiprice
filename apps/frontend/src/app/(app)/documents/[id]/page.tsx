/** @jsxRuntime automatic */
/** @jsxImportSource react */
'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { DocumentEditor } from '@/components/document-editor/DocumentEditor';
import { DocumentView } from '@/components/lifecycle/DocumentView';
import { Topbar } from '@/components/shell/Topbar';
import { ApiError } from '@/lib/api/client';
import { get } from '@/lib/api/documents';
import type { DocumentResponse } from '@/lib/api/types/document';

import styles from '@/components/lifecycle/lifecycle.module.css';

export default function DocumentPage() {
  const params = useParams<{ id: string }>();

  const [state, setState] = useState<
    | { phase: 'loading' }
    | { phase: 'ok'; document: DocumentResponse }
    | { phase: 'error'; message: string }
  >({ phase: 'loading' });

  // Tracks the id the most recently issued request is for. A response whose
  // request no longer matches this ref is stale — e.g. the user navigated from
  // document A to document B before A's fetch resolved — and must not
  // overwrite the state of the id now on screen.
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

  const handleFinalized = useCallback(
    (document?: DocumentResponse) => {
      if (document) {
        setState({ phase: 'ok', document });
      } else {
        // A 409 on save means the document was finalized elsewhere; reload to
        // get the current post-finalized state and switch to the read-only view.
        load();
      }
    },
    [load],
  );

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

  if (state.document.status === 'draft') {
    return (
      <DocumentEditor
        documentId={params.id}
        initialDocument={state.document}
        onFinalized={handleFinalized}
      />
    );
  }

  return <DocumentView document={state.document} />;
}
