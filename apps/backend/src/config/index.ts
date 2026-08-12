import { z } from 'zod';
import process from 'node:process';

/**
 * Env schema — frozen shape lives in `.env.example` and `docs/contracts/phase-0.md`.
 * Phase 2 uses JWT_SECRET + COOKIE_NAME; declared now so the compose files
 * never have to change for them.
 *
 * Boot invariant: invalid env is not a request-time failure. This module
 * throws on parse failure; `server.ts` catches and exits non-zero.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGO_URL: z.string().min(1),
  MONGO_DB: z.string().min(1),
  // Phase 2: required at runtime; declared here so the env shape is stable.
  // Empty string at boot is allowed — server won't start a session-cookie
  // route in Phase 0 anyway, and Phase 2's session module will re-check.
  JWT_SECRET: z.string().default(''),
  COOKIE_NAME: z.string().default('mp_session'),
  BACKEND_ORIGIN: z.string().url().default('http://localhost:3001'),
});

export type Env = z.infer<typeof envSchema>;

export class InvalidConfigError extends Error {
  override readonly name = 'InvalidConfigError';
  constructor(issues: z.ZodIssue[]) {
    super(`Invalid configuration:\n${issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')}`);
  }
}

/**
 * Parse `process.env` (or an injected record) against the schema.
 * Throws `InvalidConfigError` on validation failure.
 *
 * Parse-on-boot: parsing happens once at boot. Importing this from a request
 * handler is fine — the result is a frozen plain object and the schema is
 * not re-evaluated on the hot path.
 */
export function buildConfig(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) throw new InvalidConfigError(parsed.error.issues);
  return parsed.data;
}