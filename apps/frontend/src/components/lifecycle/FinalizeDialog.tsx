/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { useEffect, useRef, type FormEvent } from 'react';

import styles from './lifecycle.module.css';

type FinalizeDialogProps = {
  title: string;
  error?: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
};

export function FinalizeDialog({ title, error, onConfirm, onCancel }: FinalizeDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = 'finalize-dialog-title';

  // Focus the cancel button by default; close on Escape.
  useEffect(() => {
    cancelRef.current?.focus();

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
        // Close when clicking the overlay, not the dialog box itself.
        if (ev.target === ev.currentTarget) onCancel();
      }}
    >
      <div className={styles.dialog}>
        <h2 id={titleId} className={styles.dialogTitle}>
          Finalize document?
        </h2>
        <p className={styles.dialogBody}>
          <strong>{title || 'Untitled document'}</strong> will be locked. This is
          irreversible — no further edits, line items, or totals changes will be
          accepted.
        </p>
        {error !== undefined && (
          <p className={styles.dialogError} role="alert">
            {error}
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <div className={styles.dialogActions}>
            <button
              ref={cancelRef}
              type="button"
              className={styles.cancelBtn}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button type="submit" className={styles.confirmBtn}>
              Finalize
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
