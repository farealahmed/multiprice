/** @jsxRuntime automatic */
/** @jsxImportSource react */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DocumentSummary } from '@/lib/api/types/document';
import { formatMoney } from '@/components/money/format-money';
import { StatusPill } from './StatusPill';
import styles from './documents.module.css';

type DocumentsRowProps = {
  doc: DocumentSummary;
  onDelete: (doc: DocumentSummary) => void;
};

export function DocumentsRow({ doc, onDelete }: DocumentsRowProps) {
  const router = useRouter();

  const handleDelete = () => {
    onDelete(doc);
  };

  return (
    <tr>
      <td className={styles.num}>
        <Link href={`/documents/${doc.id}`} className={styles.rowlink}>
          {doc.title}
        </Link>
      </td>
      <td>{doc.customer}</td>
      <td className={styles.num}>{doc.issueDate}</td>
      <td>
        <StatusPill status={doc.status} />
      </td>
      <td className={`${styles.r} ${styles.num}`}>
        {formatMoney(doc.totals.grandTotal)}
      </td>
      <td>
        <div className={styles.actions}>
          <Link href={`/documents/${doc.id}`} className={styles.textlink}>
            Edit
          </Link>
          <span className={styles.sep}>·</span>
          <button
            type="button"
            className={`${styles.textlink} ${styles.danger}`}
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
