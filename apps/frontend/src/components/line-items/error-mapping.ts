import type { ApiErrorDetail } from '@/lib/api/client';

/**
 * Field-keyed errors for one editor row. The server attaches a `path` like
 * `lines.2.quantity` to every rejection detail; this maps those paths onto the
 * inputs the row actually renders. Anything that does not resolve to a known
 * field of an existing row surfaces at document level — an error must never
 * disappear because its path had no home.
 */
export type RowFieldErrors = {
  quantity?: string;
  unitPrice?: string;
  discount?: string;
  taxPercent?: string;
  /** Row-level rejection (e.g. the engine's DISCOUNT_EXCEEDS_SUBTOTAL). */
  row?: string;
};

export type MappedPricingErrors = {
  /** Keyed by row index — the same positional correlation the wire uses. */
  rows: Map<number, RowFieldErrors>;
  documentLevel: string[];
};

const LINE_PATH = /^lines\.(\d+)(?:\.(.+))?$/;

export function mapPricingErrors(
  details: ApiErrorDetail[] | undefined,
  rowCount: number,
): MappedPricingErrors {
  const rows = new Map<number, RowFieldErrors>();
  const documentLevel: string[] = [];

  for (const detail of details ?? []) {
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
      entry.row = detail.message;
    }
    rows.set(index, entry);
  }

  return { rows, documentLevel };
}
