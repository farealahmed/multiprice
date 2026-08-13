/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { DocumentSummary } from '@/lib/api/types/document';
import { DocumentsRow } from './DocumentsRow';
import styles from './documents.module.css';

type DocumentsListProps = {
  docs: DocumentSummary[];
  onDelete: (doc: DocumentSummary) => void;
};

export function DocumentsList({ docs, onDelete }: DocumentsListProps) {
  const draftCount = docs.filter((d) => d.status === 'draft').length;
  const finalizedCount = docs.filter((d) => d.status === 'finalized').length;

  return (
    <table className={styles.grid}>
      <thead>
        <tr>
          <th>Title</th>
          <th>Customer</th>
          <th>Issue date</th>
          <th>Status</th>
          <th className={styles.r}>Grand total</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {docs.map((doc) => (
          <DocumentsRow key={doc.id} doc={doc} onDelete={onDelete} />
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={5}>
            {docs.length} document{docs.length !== 1 ? 's' : ''} · {draftCount} draft
            {draftCount !== 1 ? 's' : ''} · {finalizedCount} finalized
          </td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}
