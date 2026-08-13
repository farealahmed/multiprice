/**
 * Lifecycle contract — error codes for document finalization and immutability.
 *
 * This domain deliberately declares no new request/response schemas:
 * `POST /documents/:id/finalize` and `POST /documents/:id/duplicate` both reuse
 * `contracts/document.ts`'s `documentResponseSchema` unchanged so the UI cannot
 * drift from the existing wire shape.
 */

export const DOCUMENT_FINALIZED = 'DOCUMENT_FINALIZED' as const;
export const DOCUMENT_HAS_NO_LINES = 'DOCUMENT_HAS_NO_LINES' as const;

export type LifecycleErrorCode =
  | typeof DOCUMENT_FINALIZED
  | typeof DOCUMENT_HAS_NO_LINES;

/**
 * Every `LifecycleErrorCode` member, listed once more as a value array. The
 * `satisfies` clause makes this array's element type exactly
 * `LifecycleErrorCode` — if a member is ever added to or removed from the type
 * above without updating this array, the assignment below stops type-checking.
 */
export const LIFECYCLE_ERROR_CODES = [
  DOCUMENT_FINALIZED,
  DOCUMENT_HAS_NO_LINES,
] as const satisfies readonly LifecycleErrorCode[];

type MissingFromList = Exclude<LifecycleErrorCode, (typeof LIFECYCLE_ERROR_CODES)[number]>;
// If this line fails to compile, a LifecycleErrorCode member exists that isn't
// listed in LIFECYCLE_ERROR_CODES above — add it there too.
const _allCodesListed: MissingFromList extends never ? true : never = true;
void _allCodesListed;
