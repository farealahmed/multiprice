/** @jsxRuntime automatic */
/** @jsxImportSource react */
'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import * as documents from '@/lib/api/documents';
import { ApiError, type ApiErrorDetail } from '@/lib/api/client';
import {
  isDocumentErrorCode,
  type DocumentSummary,
  type CreateDocumentInput,
  type DocumentErrorCode,
} from '@/lib/api/types/document';
import { CreateDialog } from '@/components/documents/CreateDialog';
import { DeleteDialog } from '@/components/documents/DeleteDialog';
import { DocumentsList } from '@/components/documents/DocumentsList';
import { EmptyState } from '@/components/documents/EmptyState';
import { Topbar } from '@/components/shell/Topbar';
import styles from './documents.module.css';

type PageState =
  | { phase: 'loading' }
  | { phase: 'ok'; docs: DocumentSummary[] }
  | { phase: 'error'; message: string };

const ERROR_MESSAGES: Record<DocumentErrorCode, string> = {
  TITLE_REQUIRED: 'Title is required.',
  CUSTOMER_REQUIRED: 'Customer is required.',
  ISSUE_DATE_INVALID: 'Enter a valid date in YYYY-MM-DD format.',
  DOCUMENT_NOT_FOUND: 'Document not found.',
  LINE_NOT_FOUND: 'Line not found.',
  DESCRIPTION_REQUIRED: 'Description is required.',
  SERVER_MANAGED_FIELD: 'This field cannot be set manually.',
};

function fieldError(
  details: ApiErrorDetail[] | undefined,
  path: string,
): string | undefined {
  if (!details) return undefined;
  const d = details.find((e) => e.path === path);
  if (!d) return undefined;
  return isDocumentErrorCode(d.code) ? ERROR_MESSAGES[d.code] : d.message;
}

export default function DocumentsPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>({ phase: 'loading' });
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createFieldErrors, setCreateFieldErrors] = useState<
    Record<string, string>
  >({});

  // Load on mount
  const load = useCallback(async () => {
    setPageState({ phase: 'loading' });
    try {
      const docs = await documents.list();
      setPageState({ phase: 'ok', docs });
    } catch (err) {
      setPageState({
        phase: 'error',
        message:
          err instanceof ApiError
            ? err.message
            : 'Failed to load documents. Please try again.',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Delete handlers
  const handleDeleteClick = (doc: DocumentSummary) => {
    setDeleteTarget(doc);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await documents.remove(deleteTarget.id);
      setDeleteTarget(null);
      // Reload list
      const docs = await documents.list();
      setPageState({ phase: 'ok', docs });
    } catch (err) {
      // Still close the dialog; surface error inline
      setDeleteTarget(null);
      if (err instanceof ApiError) {
        setPageState({
          phase: 'error',
          message: err.message,
        });
      }
    }
  };

  const handleDeleteCancel = () => {
    setDeleteTarget(null);
  };

  // Create handlers
  const handleCreateClick = () => {
    setCreateOpen(true);
    setSubmitError(null);
    setCreateFieldErrors({});
  };

  const handleCreateConfirm = async (input: CreateDocumentInput) => {
    setSubmitError(null);
    setCreateFieldErrors({});

    // Basic client-side validation (complement to server-side)
    const errors: Record<string, string> = {};
    if (!input.title.trim()) {
      errors.title = ERROR_MESSAGES.TITLE_REQUIRED;
    }
    if (!input.customer.trim()) {
      errors.customer = ERROR_MESSAGES.CUSTOMER_REQUIRED;
    }
    if (input.issueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate)) {
      errors.issueDate = ERROR_MESSAGES.ISSUE_DATE_INVALID;
    }

    if (Object.keys(errors).length > 0) {
      setCreateFieldErrors(errors);
      return;
    }

    try {
      const doc = await documents.create(input);
      setCreateOpen(false);
      // Navigate to the new document's editor
      router.push(`/documents/${doc.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (
          err.code === 'VALIDATION_FAILED' &&
          Array.isArray(err.details)
        ) {
          // Map server details[] to per-field errors
          const mapped: Record<string, string> = {};
          for (const detail of err.details as ApiErrorDetail[]) {
            if (isDocumentErrorCode(detail.code)) {
              mapped[detail.path] = ERROR_MESSAGES[detail.code];
            } else {
              mapped[detail.path] = detail.message;
            }
          }
          setCreateFieldErrors(mapped);
        } else {
          setSubmitError(err.message);
        }
      } else {
        setSubmitError('Failed to create document. Please try again.');
      }
    }
  };

  const handleCreateCancel = () => {
    setCreateOpen(false);
    setSubmitError(null);
    setCreateFieldErrors({});
  };

  return (
    <>
      <Topbar />
      <main className="page">
        <div className={styles.pageHead}>
          <div className={styles.kicker}>Workspace</div>
          <h1 className={styles.heading}>Documents</h1>
          <p className={styles.lede}>
            Quotes and billing documents with per-line discounts and tax. Drafts
            are fully editable; finalized documents are locked forever.
          </p>
        </div>

        {/* Loading */}
        {pageState.phase === 'loading' && (
          <div className={styles.state}>Loading…</div>
        )}

        {/* Error */}
        {pageState.phase === 'error' && (
          <div className={styles.state}>
            <p>{pageState.message}</p>
            <button type="button" className={styles.retryBtn} onClick={load}>
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {pageState.phase === 'ok' && pageState.docs.length === 0 && (
          <EmptyState onCreate={handleCreateClick} />
        )}

        {/* Document list */}
        {pageState.phase === 'ok' && pageState.docs.length > 0 && (
          <>
            <div className={styles.split}>
              <div className={styles.grow} />
              <button
                type="button"
                className={styles.btn}
                onClick={handleCreateClick}
              >
                New document <span aria-hidden="true">→</span>
              </button>
            </div>

            <DocumentsList
              docs={pageState.docs}
              onDelete={handleDeleteClick}
            />
          </>
        )}

        <hr className={styles.rule} />

        {/* Create dialog */}
        {createOpen && (
          <CreateDialog
            onConfirm={handleCreateConfirm}
            onCancel={handleCreateCancel}
          />
        )}

        {/* Delete dialog */}
        {deleteTarget !== null && (
          <DeleteDialog
            doc={deleteTarget}
            onConfirm={handleDeleteConfirm}
            onCancel={handleDeleteCancel}
          />
        )}
      </main>
    </>
  );
}
