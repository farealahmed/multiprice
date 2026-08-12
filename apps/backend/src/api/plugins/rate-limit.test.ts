import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import rateLimitPlugin from './rate-limit.ts';

async function buildRateLimitedApp(mode: string, max: number) {
  const app = Fastify();

  await app.register(rateLimitPlugin, {
    mode,
    options: { max, timeWindow: '1 minute' },
  });
  app.get('/limited', async () => ({ ok: true }));
  await app.ready();

  return app;
}

describe('global rate limit plugin', () => {
  it('returns the rate-limit envelope and Retry-After after the cap', async () => {
    const app = await buildRateLimitedApp('production', 2);

    try {
      expect((await app.inject({ method: 'GET', url: '/limited' })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/limited' })).statusCode).toBe(200);

      const limited = await app.inject({ method: 'GET', url: '/limited' });
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toEqual({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, try again shortly.',
        },
      });
      expect(limited.headers['retry-after']).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('does not limit requests in injected test mode', async () => {
    const app = await buildRateLimitedApp('test', 1);

    try {
      const responses = await Promise.all(
        Array.from({ length: 3 }, () => app.inject({ method: 'GET', url: '/limited' })),
      );

      expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    } finally {
      await app.close();
    }
  });
});

// @fastify/autoload scans every TypeScript file in this directory. Export a
// no-op plugin so this colocated test module is ignored safely at app boot.
export default async function rateLimitTestModule() {}
