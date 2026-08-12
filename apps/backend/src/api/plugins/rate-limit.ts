import rateLimit, { type FastifyRateLimitOptions } from '@fastify/rate-limit';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

export interface RateLimitPluginOptions {
  /** Injectable so direct plugin tests need not mutate process.env. */
  mode?: string;
  /** Injectable overrides for tests or an explicit host integration. */
  options?: FastifyRateLimitOptions;
}

const defaultOptions: FastifyRateLimitOptions = {
  max: 1_000,
  timeWindow: '1 minute',
};

// Known limitation: this limits by `request.ip`, which in the Compose
// topology is the frontend container's address, not the original browser's
// — every user behind the Next.js same-origin rewrite (next.config.ts)
// shares one bucket. Next's `rewrites()` proxy (next/dist/server/lib/
// router-utils/proxy-request.js, verified against the installed version)
// only ever sets `x-forwarded-host`; it does not forward `x-forwarded-for`,
// so there is no header here to trust via `trustProxy`. Fixing this
// properly needs either patching Next's bundled proxy (fragile across
// upgrades) or a real reverse proxy in front of both services terminating
// the true client connection — both are infra changes beyond this phase.
// The 1000 req/min global cap is generous enough that shared bucketing
// rarely bites; revisit if/when a reverse proxy is introduced.

const rateLimitPlugin: FastifyPluginAsync<RateLimitPluginOptions> = async (
  app,
  { mode = process.env.NODE_ENV, options = {} },
) => {
  if (mode === 'test') return;

  await app.register(rateLimit, {
    ...defaultOptions,
    ...options,
    // The plugin supplies the per-IP store and limiter; this plugin owns the
    // global response hook so its envelope bypasses the 500-only fallback.
    global: false,
  });

  const limitRequest = app.createRateLimit();
  app.addHook('onRequest', async (request, reply) => {
    const result = await limitRequest(request);
    if (result.isAllowed || !result.isExceeded) return;

    return reply
      .header('retry-after', result.ttlInSeconds)
      .code(429)
      .send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, try again shortly.',
        },
      });
  });
};

export default fp(rateLimitPlugin, { name: 'rate-limit' });
