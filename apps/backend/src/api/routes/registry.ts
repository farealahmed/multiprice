/**
 * Guarded-route registry — single source of truth for routes that mutate an
 * existing document and therefore must be blocked once the document is finalized.
 *
 * The immutability guard (T4) reads this list at route-registration time, and
 * the evidence suite (T6) iterates it instead of hand-listing routes. It is a
 * read-only lookup table per `parallel-execution.md`'s "no shared append-target"
 * rule: both lanes read it, neither appends to it.
 */

export type GuardedRoute = {
  readonly method: string;
  readonly path: string;
};

/**
 * The six existing-document mutations.
 *
 * `POST /api/v1/documents` is intentionally absent: it creates a new document,
 * it does not mutate an existing one. `POST /api/v1/documents/:id/duplicate` is
 * also absent: it creates a new draft and never mutates the source document.
 */
export const GUARDED_ROUTES: ReadonlyArray<GuardedRoute> = [
  { method: 'PATCH', path: '/api/v1/documents/:id' },
  { method: 'DELETE', path: '/api/v1/documents/:id' },
  { method: 'POST', path: '/api/v1/documents/:id/lines' },
  { method: 'PATCH', path: '/api/v1/documents/:id/lines/:lineId' },
  { method: 'DELETE', path: '/api/v1/documents/:id/lines/:lineId' },
  { method: 'POST', path: '/api/v1/documents/:id/finalize' },
] as const;
