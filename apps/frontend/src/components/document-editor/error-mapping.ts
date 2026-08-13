import type { ApiErrorDetail } from '@/lib/api/client';

import type { RowFieldErrors } from '@/components/line-items/error-mapping';

export type DocumentEditorErrors = {
  metadata: {
    title?: string;
    customer?: string;
    issueDate?: string;
  };
  rows: Map<number, RowFieldErrors>;
  documentLevel: string[];
};

const LINE_PATH = /^lines\.(\d+)(?:\.(.+))?$/;

/**
 * Resolves document-validation paths to the fields the editor renders. Every
 * unresolved path remains visible at document level rather than being dropped.
 */
export function mapDocumentErrors(
  details: ApiErrorDetail[] | undefined,
  rowCount: number,
  fallback?: string,
): DocumentEditorErrors {
  const metadata: DocumentEditorErrors['metadata'] = {};
  const rows = new Map<number, RowFieldErrors>();
  const documentLevel: string[] = [];

  for (const detail of details ?? []) {
    if (detail.path === 'title' || detail.path === 'customer' || detail.path === 'issueDate') {
      metadata[detail.path] = detail.message;
      continue;
    }

    const match = LINE_PATH.exec(detail.path);
    const index = match === null ? Number.NaN : Number(match[1]);
    if (match === null || index >= rowCount) {
      documentLevel.push(detail.message);
      continue;
    }

    const field = match[2];
    const entry = rows.get(index) ?? {};
    if (field?.startsWith('quantity') === true) {
      entry.quantity = detail.message;
    } else if (field?.startsWith('unitPrice') === true) {
      entry.unitPrice = detail.message;
    } else if (field?.startsWith('discount') === true) {
      entry.discount = detail.message;
    } else if (field?.startsWith('taxPercent') === true) {
      entry.taxPercent = detail.message;
    } else {
      // The existing row renders row-level errors beside its description field.
      entry.row = detail.message;
    }
    rows.set(index, entry);
  }

  if (rows.size === 0 && Object.keys(metadata).length === 0 && documentLevel.length === 0 && fallback !== undefined) {
    documentLevel.push(fallback);
  }

  return { metadata, rows, documentLevel };
}
