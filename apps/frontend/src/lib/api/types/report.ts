// Hand-written mirror of apps/backend/src/contracts/report.ts — keep in sync by hand.
// Rule 1 of the phase plan: duplication is deliberate; do not introduce code generation.

export const DATE_RANGE_INVALID = 'DATE_RANGE_INVALID';
export const DATE_RANGE_INVERTED = 'DATE_RANGE_INVERTED';

export type ReportErrorCode =
  | typeof DATE_RANGE_INVALID
  | typeof DATE_RANGE_INVERTED;

export type ReportSummary = {
  from: string;
  to: string;
  documentCount: number;
  totalGrandTotal: number;
  totalTax: number;
  totalDiscount: number;
};

export type DateRangeQuery = {
  from?: string;
  to?: string;
};

/**
 * Every `ReportErrorCode` member, listed once more as a value array. The
 * `satisfies` clause below makes this array's element type exactly
 * `ReportErrorCode` — if a member is ever added to or removed from the type
 * above without updating this array, the assignment two lines down stops
 * type-checking. This is what actually makes the "hand-mirrored, guarded by
 * compile-time type-checking" claim true for error codes, not just for
 * request/response shapes.
 */
const REPORT_ERROR_CODES = [
  DATE_RANGE_INVALID,
  DATE_RANGE_INVERTED,
] as const satisfies readonly ReportErrorCode[];

type MissingFromList = Exclude<ReportErrorCode, (typeof REPORT_ERROR_CODES)[number]>;
// If this line fails to compile, a ReportErrorCode member exists that isn't
// listed in REPORT_ERROR_CODES above — add it there too.
const _allCodesListed: MissingFromList extends never ? true : never = true;
void _allCodesListed;

/** Narrows a raw API error code to this domain's known set of codes. */
export function isReportErrorCode(code: string): code is ReportErrorCode {
  return (REPORT_ERROR_CODES as readonly string[]).includes(code);
}
