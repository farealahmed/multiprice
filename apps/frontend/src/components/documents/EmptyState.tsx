/** @jsxRuntime automatic */
/** @jsxImportSource react */
import styles from './documents.module.css';

type EmptyStateProps = {
  onCreate: () => void;
};

export function EmptyState({ onCreate }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {/* Document stack icon */}
      <svg
        className={styles.emptyIcon}
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
      >
        <rect x="6" y="14" width="28" height="36" rx="2" stroke="currentColor" strokeWidth="2" />
        <rect x="14" y="6" width="28" height="36" rx="2" stroke="currentColor" strokeWidth="2" fill="var(--cream)" />
        <line x1="20" y1="18" x2="36" y2="18" stroke="currentColor" strokeWidth="2" />
        <line x1="20" y1="25" x2="36" y2="25" stroke="currentColor" strokeWidth="2" />
        <line x1="20" y1="32" x2="28" y2="32" stroke="currentColor" strokeWidth="2" />
      </svg>
      <h2 className={styles.emptyHeading}>No documents yet</h2>
      <p className={styles.emptyBody}>
        Create your first document to start quoting and billing with per-line
        discounts and tax.
      </p>
      <button type="button" className={styles.btn} onClick={onCreate}>
        New document <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
