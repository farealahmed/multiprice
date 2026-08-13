/** @jsxRuntime automatic */
/** @jsxImportSource react */

import styles from './lifecycle.module.css';

type StatusBannerProps = {
  children: React.ReactNode;
};

/**
 * Read-only status banner used on finalized documents. Renders a non-interactive
 * notice that explains the document is locked; the API is the only enforcement
 * point, and this banner only reflects the finalized state.
 */
export function StatusBanner({ children }: StatusBannerProps) {
  return (
    <div className={styles.lockedNotice} role="status">
      <span aria-hidden="true" className={styles.lockedNoticeSquare} />
      <span>{children}</span>
    </div>
  );
}
