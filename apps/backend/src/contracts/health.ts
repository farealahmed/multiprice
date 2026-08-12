import { z } from 'zod';

/**
 * Health response contract.
 *
 * `GET /api/health` returns this shape. The route validates its response
 * against the schema so a drift here breaks the route, not the browser.
 *
 * `version` is opaque to the client; the source (env var, package.json) is
 * chosen by Lane 0-A.
 */
export const healthResponse = z.object({
  status: z.union([z.literal('ok'), z.literal('degraded')]),
  db: z.union([z.literal('up'), z.literal('down')]),
  version: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponse>;