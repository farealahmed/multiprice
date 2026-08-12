// Hand-written mirror of apps/backend/src/contracts/auth.ts — keep in sync by hand.
// Rule 1 of the phase plan: duplication is deliberate; do not introduce code generation.

export type SignupInput = {
  email: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type SessionUser = {
  id: string;
  email: string;
  createdAt: string;
};

export const EMAIL_TAKEN = 'EMAIL_TAKEN';
export const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS';
export const UNAUTHENTICATED = 'UNAUTHENTICATED';
export const PASSWORD_TOO_SHORT = 'PASSWORD_TOO_SHORT';
export const EMAIL_INVALID = 'EMAIL_INVALID';

export type AuthErrorCode =
  | typeof EMAIL_TAKEN
  | typeof INVALID_CREDENTIALS
  | typeof UNAUTHENTICATED
  | typeof PASSWORD_TOO_SHORT
  | typeof EMAIL_INVALID;

/**
 * Every `AuthErrorCode` member, listed once more as a value array. The
 * `satisfies` clause below makes this array's element type exactly
 * `AuthErrorCode` — if a member is ever added to or removed from the type
 * above without updating this array, the assignment two lines down stops
 * type-checking. This is what actually makes the "hand-mirrored, guarded by
 * compile-time type-checking" claim true for error codes, not just for
 * `SignupInput`/`LoginInput`/`SessionUser`.
 */
const AUTH_ERROR_CODES = [
  EMAIL_TAKEN,
  INVALID_CREDENTIALS,
  UNAUTHENTICATED,
  PASSWORD_TOO_SHORT,
  EMAIL_INVALID,
] as const satisfies readonly AuthErrorCode[];

type MissingFromList = Exclude<AuthErrorCode, (typeof AUTH_ERROR_CODES)[number]>;
// If this line fails to compile, an AuthErrorCode member exists that isn't
// listed in AUTH_ERROR_CODES above — add it there too.
const _allCodesListed: MissingFromList extends never ? true : never = true;
void _allCodesListed;

/** Narrows a raw API error code to this domain's known set of codes. */
export function isAuthErrorCode(code: string): code is AuthErrorCode {
  return (AUTH_ERROR_CODES as readonly string[]).includes(code);
}
