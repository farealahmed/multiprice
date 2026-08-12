// Hand-written mirror of apps/backend/src/contracts/health.ts — keep in sync by hand.
// Rule 1 of the phase plan: duplication is deliberate; do not introduce code generation.

export type HealthResponse = {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  version: string;
};