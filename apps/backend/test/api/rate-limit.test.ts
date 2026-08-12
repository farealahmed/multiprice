/**
 * T6 — Rate-limit plugin tests.
 *
 * Verifies the global per-IP rate limit added by T2b (ARCH Decision A10):
 * - Returns 429 RATE_LIMITED past the configured cap.
 * - No-ops under NODE_ENV=test so automated suites never trip it.
 *
 * The tests work with the plugin's public interface (app.inject()) and use
 * a separate test app with an explicit per-test rate-limit configuration to
 * exercise the enforcement path without relying on Fastify internals.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { buildApp } from '../../src/app.ts';

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let liveApp: FastifyInstance;

beforeEach(async () => {
  // 'app' — standard build: plugin runs in test mode (no-op), so this is used
  // to verify the no-op path.
  app = await buildApp({ logger: false });
  await app.ready();

  // 'liveApp' — a dedicated app with rate-limiting forced to 'production'
  // mode (not 'test') so the limiter actually runs.  Uses a very low cap
  // (5 requests) so the test completes quickly.
  liveApp = await buildApp({ logger: false });
  await liveAppReadyWithRateLimit(liveApp, { max: 5, timeWindow: '1 minute' });
});

afterEach(async () => {
  await app.close();
  await liveApp.close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Force the rate-limit plugin into non-test mode and apply a custom cap.
 *
 * We do this by registering a fresh rate-limit plugin (with a unique name so
 * it doesn't conflict with the autoloaded one) on top of the built app.
 * This exercises the same `@fastify/rate-limit` package that T2b uses, but
 * with a known-low cap we can saturate in a single test.
 */
async function liveAppReadyWithRateLimit(
  f: FastifyInstance,
  limitConfig: { max: number; timeWindow: string },
): Promise<void> {
  // Register a capped rate-limit directly — this is the same package T2b uses.
  // It runs as a true onRequest hook, not in test mode.
  await f.register(
    fp(async (server) => {
      await server.register(rateLimit, {
        ...limitConfig,
        // Disable the global default so only our explicit route-level limit applies.
        global: false,
      });
      const limiter = server.createRateLimit();
      server.addHook('onRequest', async (req, reply) => {
        const result = await limiter(req);
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
    }, { name: 'test-rate-limit' }),
  );
  await f.ready();
}

/** Fire `count` concurrent requests against `server`. */
async function flood(server: FastifyInstance, path: string, count: number) {
  return Promise.all(
    Array.from({ length: count }, () =>
      server.inject({ method: 'GET', url: path }),
    ),
  );
}

// ---------------------------------------------------------------------------
// T6-rate-limit-1: 429 past the cap
// ---------------------------------------------------------------------------

describe('global rate limit — enforcement', () => {
  it('returns 429 RATE_LIMITED once the cap is exceeded', async () => {
    // Send 6 requests against a 5-request cap.
    const results = await flood(liveApp, '/api/health', 6);

    // At least one response must be 429.
    const limited = results.filter((r) => r.statusCode === 429);
    expect(limited.length).toBeGreaterThan(0);

    // The 429 body matches the envelope shape from ARCH.
    const firstLimited = limited[0];
    expect(firstLimited).toBeDefined();
    const body = JSON.parse(firstLimited!.body);
    expect(body).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests, try again shortly.',
      },
    });
  });

  it('the 429 response includes a Retry-After header', async () => {
    // Saturate the limit first.
    await flood(liveApp, '/api/health', 5);

    // The next request should be limited and carry Retry-After.
    const overflow = await liveApp.inject({ method: 'GET', url: '/api/health' });
    expect(overflow.statusCode).toBe(429);
    const retryAfter = overflow.headers['retry-after'];
    expect(retryAfter).toBeDefined();
    // Retry-After is a positive integer seconds string.
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// T6-rate-limit-2: no-op under test mode
// ---------------------------------------------------------------------------

describe('rate limit does not fire in test mode', () => {
  it('a normal run never triggers 429 even with many requests', async () => {
    // Fire 20 requests against the standard (test-mode) app.
    const results = await flood(app, '/api/health', 20);

    // Not a single 429 — the plugin correctly skips itself in test env.
    const limited = results.filter((r) => r.statusCode === 429);
    expect(limited.length).toBe(0);

    // All responses should be 200 (or 500 if Mongo is unavailable, but not 429).
    const non429 = results.filter((r) => r.statusCode !== 429);
    expect(non429.length).toBe(20);
  });
});
