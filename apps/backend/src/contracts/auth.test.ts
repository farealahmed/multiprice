import { describe, it, expect } from 'vitest';
import {
  signupInputSchema,
  loginInputSchema,
  sessionUserSchema,
  EMAIL_INVALID,
  PASSWORD_TOO_SHORT,
} from './auth.ts';

/** First custom-issue's domain code, or undefined if none was raised. */
function domainCode(result: ReturnType<typeof signupInputSchema.safeParse>): string | undefined {
  if (result.success) return undefined;
  const issue = result.error.issues.find((i) => i.code === 'custom');
  return issue && 'params' in issue ? (issue.params as { code?: string } | undefined)?.code : undefined;
}

describe('auth schemas — acceptance', () => {
  it('accepts a valid SignupInput/LoginInput at each boundary', () => {
    const cases = [
      { email: 'test@example.com', password: 'a'.repeat(12) },
      { email: 'test@example.com', password: 'a'.repeat(128) },
    ];
    for (const input of cases) {
      expect(signupInputSchema.safeParse(input).success).toBe(true);
      expect(loginInputSchema.safeParse(input).success).toBe(true);
    }
  });

  it('accepts a well-formed email in any case', () => {
    const result = signupInputSchema.safeParse({
      email: 'Test@Example.com',
      password: 'a'.repeat(12),
    });
    expect(result.success).toBe(true);
  });
});

describe('auth schemas — rejection', () => {
  it('rejects a password under 12 characters', () => {
    const result = signupInputSchema.safeParse({
      email: 'test@example.com',
      password: 'a'.repeat(11),
    });
    expect(result.success).toBe(false);
    expect(domainCode(result)).toBe(PASSWORD_TOO_SHORT);
  });

  it('rejects a password over the 128-character cap', () => {
    const result = signupInputSchema.safeParse({
      email: 'test@example.com',
      password: 'a'.repeat(129),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed email', () => {
    const result = signupInputSchema.safeParse({
      email: 'not-an-email',
      password: 'a'.repeat(12),
    });
    expect(result.success).toBe(false);
    expect(domainCode(result)).toBe(EMAIL_INVALID);
  });
});

describe('auth schemas — shape guarantees', () => {
  it('SessionUser has no password field', () => {
    const keys = Object.keys(sessionUserSchema.shape);
    expect(keys).toEqual(['id', 'email', 'createdAt']);
  });
});
