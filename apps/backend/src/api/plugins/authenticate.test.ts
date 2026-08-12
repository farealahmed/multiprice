import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.ts';

const TEST_SECRET = 'test-secret-that-is-at-least-32-bytes-long-for-hs256';
const COOKIE_NAME = 'mp_session';
const USER_ID = '64c0f6e8f5d1a2b3c4d5e6f7';

let app: FastifyInstance;

beforeEach(async () => {
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.COOKIE_NAME = COOKIE_NAME;
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URL = 'mongodb://localhost:27017';
  process.env.MONGO_DB = 'multiprice';

  app = await buildApp({ logger: false });
  // Do not call app.ready() here; tests register their own routes before
  // invoking app.inject(), which triggers ready internally.
});

afterEach(async () => {
  await app?.close();
});

function signToken(sub: string): string {
  return app.jwt.sign({ sub });
}

describe('app.authenticate preHandler', () => {
  it('decorates request.userId when a valid session cookie is present', async () => {
    const token = signToken(USER_ID);

    app.get('/protected', { preHandler: app.authenticate }, async (request) => {
      return { userId: request.userId };
    });

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { cookie: `${COOKIE_NAME}=${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: USER_ID });
  });

  it('rejects a request with no session cookie (401 UNAUTHENTICATED)', async () => {
    app.get('/protected', { preHandler: app.authenticate }, async () => ({ ok: true }));

    const res = await app.inject({ method: 'GET', url: '/protected' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: expect.any(String) },
    });
  });

  it('rejects a tampered or invalid token (401 UNAUTHENTICATED)', async () => {
    app.get('/protected', { preHandler: app.authenticate }, async () => ({ ok: true }));

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { cookie: `${COOKIE_NAME}=totally-bogus-token` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: expect.any(String) },
    });
  });
});

describe('app.authenticate is opt-in, not global', () => {
  it('does not apply to routes that do not attach it', async () => {
    app.get('/public', async () => ({ ok: true }));

    const res = await app.inject({ method: 'GET', url: '/public' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

// @fastify/autoload scans every TypeScript file in this directory. Export a
// no-op plugin so this colocated test module is ignored safely at app boot.
export default async function authenticateTestModule() {}
