/** @jsxRuntime automatic */
/** @jsxImportSource react */
import styles from './documents.module.css';

type StatusPillProps = {
  status: 'draft' | 'finalized';
};

/** Visual pill for document status — distinct styles for draft vs. finalized. */
export function StatusPill({ status }: StatusPillProps) {
  return (
    <span className={`${styles.status} ${styles[status]}`}>
      {status === 'draft' ? 'Draft' : 'Finalized'}
    </span>
  );
}
