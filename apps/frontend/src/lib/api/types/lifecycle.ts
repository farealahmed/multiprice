// Hand-written mirror of apps/backend/src/contracts/lifecycle.ts — keep in sync by hand.
// Rule 1 of the phase plan: duplication is deliberate; do not introduce code generation.

export const DOCUMENT_FINALIZED = 'DOCUMENT_FINALIZED';
export const DOCUMENT_HAS_NO_LINES = 'DOCUMENT_HAS_NO_LINES';

export type LifecycleErrorCode =
  | typeof DOCUMENT_FINALIZED
  | typeof DOCUMENT_HAS_NO_LINES;

/**
 * Every `LifecycleErrorCode` member, listed once more as a value array. The
 * `satisfies` clause below makes this array's element type exactly
 * `LifecycleErrorCode` — if a member is ever added to or removed from the type
 * above without updating this array, the assignment two lines down stops
 * type-checking. This is what actually makes the "hand-mirrored, guarded by
 * compile-time type-checking" claim true for error codes, not just for
 * request/response shapes.
 */
const LIFECYCLE_ERROR_CODES = [
  DOCUMENT_FINALIZED,
  DOCUMENT_HAS_NO_LINES,
] as const satisfies readonly LifecycleErrorCode[];

type MissingFromList = Exclude<LifecycleErrorCode, (typeof LIFECYCLE_ERROR_CODES)[number]>;
// If this line fails to compile, a LifecycleErrorCode member exists that isn't
// listed in LIFECYCLE_ERROR_CODES above — add it there too.
const _allCodesListed: MissingFromList extends never ? true : never = true;
void _allCodesListed;

/** Narrows a raw API error code to this domain's known set of codes. */
export function isLifecycleErrorCode(code: string): code is LifecycleErrorCode {
  return (LIFECYCLE_ERROR_CODES as readonly string[]).includes(code);
}
