import { z } from 'zod';

/**
 * Auth contract — schemas and error codes for `POST /auth/signup`,
 * `POST /auth/login`, `POST /auth/logout`, and `GET /auth/me`.
 *
 * Validation failures that correspond to this domain's error codes are raised
 * through zod's `superRefine`/`ctx.addIssue({ code: 'custom', params: { code } })`
 * so the existing envelope mapper can surface a SCREAMING_SNAKE domain code.
 */

export const EMAIL_TAKEN = 'EMAIL_TAKEN' as const;
export const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS' as const;
export const UNAUTHENTICATED = 'UNAUTHENTICATED' as const;
export const PASSWORD_TOO_SHORT = 'PASSWORD_TOO_SHORT' as const;
export const EMAIL_INVALID = 'EMAIL_INVALID' as const;

export type AuthErrorCode =
  | typeof EMAIL_TAKEN
  | typeof INVALID_CREDENTIALS
  | typeof UNAUTHENTICATED
  | typeof PASSWORD_TOO_SHORT
  | typeof EMAIL_INVALID;

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

/** Minimal, strict-enough email shape check. */
function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const emailField = z.string().superRefine((value, ctx) => {
  if (!isEmail(value)) {
    ctx.addIssue({
      code: 'custom',
      path: [],
      params: { code: EMAIL_INVALID },
      message: 'Invalid email address',
    });
  }
});

const passwordField = z
  .string()
  .max(MAX_PASSWORD_LENGTH, `Password must not exceed ${MAX_PASSWORD_LENGTH} characters`)
  .superRefine((value, ctx) => {
    if (value.length < MIN_PASSWORD_LENGTH) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        params: { code: PASSWORD_TOO_SHORT },
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }
  });

export const signupInputSchema = z.object({
  email: emailField,
  password: passwordField,
});

export type SignupInput = z.infer<typeof signupInputSchema>;

export const loginInputSchema = z.object({
  email: emailField,
  password: passwordField,
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  createdAt: z.string(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;
