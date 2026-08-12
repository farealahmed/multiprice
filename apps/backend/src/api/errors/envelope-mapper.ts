import { ZodError } from 'zod';
import { VALIDATION_FAILED, INTERNAL_ERROR, type ErrorEnvelope } from '../../contracts/errors/envelope.ts';

/**
 * Maps any thrown value to the frozen ErrorEnvelope shape.
 *
 * - ZodError → VALIDATION_FAILED with `details[]` populated from issue paths
 *   (Phase 3's editor surfaces these as per-field messages). When an issue
 *   is `code: 'custom'` and carries a string `params.code` (a domain schema
 *   attached one via `superRefine`/`ctx.addIssue`), that code is used
 *   instead of zod's generic issue code — additive, since no existing
 *   schema sets `params.code` today (ARCH Decision A5).
 * - Anything else → INTERNAL_ERROR with a generic message. The underlying
 *   error is logged by the caller (`error-handler.ts`), never echoed in
 *   the response.
 */
export function mapToEnvelope(err: unknown): ErrorEnvelope {
  if (err instanceof ZodError) {
    return {
      error: {
        code: VALIDATION_FAILED,
        message: 'Validation failed',
        details: err.issues.map((i) => {
          const domainCode =
            i.code === 'custom' && typeof (i.params as { code?: unknown } | undefined)?.code === 'string'
              ? ((i.params as { code: string }).code)
              : undefined;
          return {
            path: i.path.map(String).join('.') || '(root)',
            code: domainCode ?? i.code,
            message: i.message,
          };
        }),
      },
    };
  }

  // Unmapped: generic message; the cause is logged by the handler.
  return {
    error: {
      code: INTERNAL_ERROR,
      message: 'Internal server error',
    },
  };
}