import { randomUUID } from 'node:crypto';
import type { FastifyServerOptions } from 'fastify';

/**
 * Observability setup.
 *
 * Pino is Fastify's default logger; Phase 0 adds only `genReqId` so every log
 * line for a request carries the same `reqId`. No redact list yet — Phase 0
 * has no secrets in logs. Phase 2 may add a redact list when auth lands.
 *
 * `loggerInstance` is returned for tests that capture log output directly
 * (the error-handler regression guard).
 */
export function buildLoggerOptions(opts: {
  level?: FastifyServerOptions['logger'];
} = {}): FastifyServerOptions['logger'] {
  if (opts.level !== undefined) return opts.level;
  // Default: pino-pretty in dev, JSON in production.
  return process.env.NODE_ENV === 'production' ? { level: 'info' } : { level: 'debug' };
}

export function genReqId(): string {
  return randomUUID();
}