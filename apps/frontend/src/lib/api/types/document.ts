// Hand-written mirror of apps/backend/src/contracts/document.ts — keep in sync by hand.
// Rule 1 of the phase plan: duplication is deliberate; do not introduce code generation.

export type LineItemInput = {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount:
    | { type: 'none' }
    | { type: 'percent'; value: number }
    | { type: 'fixed'; value: number };
  taxPercent: number | null;
};

export type CreateDocumentInput = {
  title: string;
  customer: string;
  issueDate: string;
  lines?: LineItemInput[];
};

export type UpdateDocumentInput = {
  title?: string;
  customer?: string;
  issueDate?: string;
  lines?: LineItemInput[];
};

export type UpdateLineItemInput = {
  id?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  discount?:
    | { type: 'none' }
    | { type: 'percent'; value: number }
    | { type: 'fixed'; value: number };
  taxPercent?: number | null;
};

export type LineItemResponse = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount:
    | { type: 'none' }
    | { type: 'percent'; value: number }
    | { type: 'fixed'; value: number };
  taxPercent: number | null;
};

export type DocumentTotals = {
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
};

export type DocumentResponse = {
  id: string;
  title: string;
  customer: string;
  issueDate: string;
  status: 'draft' | 'finalized';
  lines: LineItemResponse[];
  totals: DocumentTotals;
  createdAt: string;
  updatedAt: string;
};

export type DocumentSummary = Omit<DocumentResponse, 'lines'>;

export const DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND';
export const TITLE_REQUIRED = 'TITLE_REQUIRED';
export const CUSTOMER_REQUIRED = 'CUSTOMER_REQUIRED';
export const ISSUE_DATE_INVALID = 'ISSUE_DATE_INVALID';
export const LINE_NOT_FOUND = 'LINE_NOT_FOUND';
export const DESCRIPTION_REQUIRED = 'DESCRIPTION_REQUIRED';
export const SERVER_MANAGED_FIELD = 'SERVER_MANAGED_FIELD';

export type DocumentErrorCode =
  | typeof DOCUMENT_NOT_FOUND
  | typeof TITLE_REQUIRED
  | typeof CUSTOMER_REQUIRED
  | typeof ISSUE_DATE_INVALID
  | typeof LINE_NOT_FOUND
  | typeof DESCRIPTION_REQUIRED
  | typeof SERVER_MANAGED_FIELD;

/**
 * Every `DocumentErrorCode` member, listed once more as a value array. The
 * `satisfies` clause below makes this array's element type exactly
 * `DocumentErrorCode` — if a member is ever added to or removed from the type
 * above without updating this array, the assignment two lines down stops
 * type-checking. This is what actually makes the "hand-mirrored, guarded by
 * compile-time type-checking" claim true for error codes, not just for the
 * request/response shapes.
 */
const DOCUMENT_ERROR_CODES = [
  DOCUMENT_NOT_FOUND,
  TITLE_REQUIRED,
  CUSTOMER_REQUIRED,
  ISSUE_DATE_INVALID,
  LINE_NOT_FOUND,
  DESCRIPTION_REQUIRED,
  SERVER_MANAGED_FIELD,
] as const satisfies readonly DocumentErrorCode[];

type MissingFromList = Exclude<DocumentErrorCode, (typeof DOCUMENT_ERROR_CODES)[number]>;
// If this line fails to compile, a DocumentErrorCode member exists that isn't
// listed in DOCUMENT_ERROR_CODES above — add it there too.
const _allCodesListed: MissingFromList extends never ? true : never = true;
void _allCodesListed;

/** Narrows a raw API error code to this domain's known set of codes. */
export function isDocumentErrorCode(code: string): code is DocumentErrorCode {
  return (DOCUMENT_ERROR_CODES as readonly string[]).includes(code);
}
