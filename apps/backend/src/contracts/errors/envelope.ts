/**
 * Frozen error envelope — owned by G0, never amended by later gates.
 *
 * Every non-2xx response across the API carries this shape. Two envelope-level
 * codes live here (`VALIDATION_FAILED`, `INTERNAL_ERROR`); domain codes (e.g.
 * `DOCUMENT_NOT_FOUND`) live in the domain's own contract file, never here.
 *
 * `details[]` carries per-field validation failures so the client can render
 * field-level messages without parsing free-form strings.
 */
export type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: Array<{ path: string; code: string; message: string }>;
  };
};

export const VALIDATION_FAILED = 'VALIDATION_FAILED' as const;
export const INTERNAL_ERROR = 'INTERNAL_ERROR' as const;

export type EnvelopeLevelCode = typeof VALIDATION_FAILED | typeof INTERNAL_ERROR;