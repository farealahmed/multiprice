import { ZodError } from 'zod';
import { VALIDATION_FAILED, INTERNAL_ERROR, type ErrorEnvelope } from '../../contracts/errors/envelope.ts';

/**
 * Maps any thrown value to the frozen ErrorEnvelope shape.
 *
 * - ZodError → VALIDATION_FAILED with `details[]` populated from issue paths
 *   (Phase 3's editor surfaces these as per-field messages).
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
        details: err.issues.map((i) => ({
          path: i.path.map(String).join('.') || '(root)',
          code: i.code,
          message: i.message,
        })),
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