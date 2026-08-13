/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { useEffect, useRef, type FormEvent } from 'react';
import { ApiError, type ApiErrorDetail } from '@/lib/api/client';
import {
  isDocumentErrorCode,
  type CreateDocumentInput,
  type DocumentErrorCode,
} from '@/lib/api/types/document';
import styles from './documents.module.css';

type CreateDialogProps = {
  onConfirm: (input: CreateDocumentInput) => Promise<void>;
  onCancel: () => void;
};

type FieldErrors = {
  title?: string;
  customer?: string;
  issueDate?: string;
};

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

export function CreateDialog({ onConfirm, onCancel }: CreateDialogProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const titleId = 'create-dialog-title';

  useEffect(() => {
    titleRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    const title = (data.get('title') as string | null)?.trim() ?? '';
    const customer = (data.get('customer') as string | null)?.trim() ?? '';
    const issueDate = (data.get('issueDate') as string | null)?.trim() ?? '';

    const errors: FieldErrors = {};
    if (!title) errors.title = ERROR_MESSAGES.TITLE_REQUIRED;
    if (!customer) errors.customer = ERROR_MESSAGES.CUSTOMER_REQUIRED;
    if (issueDate && !/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
      errors.issueDate = ERROR_MESSAGES.ISSUE_DATE_INVALID;
    }

    if (Object.keys(errors).length > 0) {
      // Report native validation too
      form.reportValidity();
      return;
    }

    await onConfirm({ title, customer, issueDate });
  };

  // onConfirm may throw an ApiError — the page handles the submit error;
  // CreateDialog itself only handles native validation and close-on-Escape.

  return (
    <div
      className={styles.dialogOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onCancel();
      }}
    >
      <div className={styles.dialog}>
        <h2 id={titleId} className={styles.dialogTitle}>
          New document
        </h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.form}>
            <div className={styles.formField}>
              <label htmlFor="doc-title">Title</label>
              <input
                ref={titleRef}
                id="doc-title"
                name="title"
                type="text"
                autoComplete="off"
                required
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="doc-customer">Customer</label>
              <input
                id="doc-customer"
                name="customer"
                type="text"
                autoComplete="off"
                required
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="doc-issue-date">Issue date</label>
              <input
                id="doc-issue-date"
                name="issueDate"
                type="date"
                autoComplete="off"
              />
            </div>
          </div>
          <div className={styles.dialogActions}>
            <button type="button" className={styles.cancelBtn} onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn}>
              Create document
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
