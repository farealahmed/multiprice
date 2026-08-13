/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { useEffect, useRef, type FormEvent } from 'react';
import type { DocumentSummary } from '@/lib/api/types/document';
import styles from './documents.module.css';

type DeleteDialogProps = {
  doc: DocumentSummary;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
};

export function DeleteDialog({ doc, onConfirm, onCancel }: DeleteDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = 'delete-dialog-title';

  // Trap focus in dialog; close on Escape
  useEffect(() => {
    confirmRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onConfirm();
  };

  return (
    <div
      className={styles.dialogOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(ev) => {
        // Close when clicking the overlay, not the dialog box itself
        if (ev.target === ev.currentTarget) onCancel();
      }}
    >
      <div className={styles.dialog}>
        <h2 id={titleId} className={styles.dialogTitle}>
          Delete document?
        </h2>
        <p className={styles.deleteBody}>
          <strong>{doc.title}</strong> for {doc.customer} will be permanently
          removed. This cannot be undone.
        </p>
        <form onSubmit={handleSubmit}>
          <div className={styles.deleteActions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              ref={confirmRef}
              type="submit"
              className={styles.deleteBtn}
            >
              Delete
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
