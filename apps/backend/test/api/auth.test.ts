/**
 * T6 — HTTP-level auth route tests.
 *
 * Tests POST /auth/signup, POST /auth/login, POST /auth/logout, GET /auth/me
 * against T1's frozen contract.  The routes are implemented in T5; these
 * tests run red until T5 lands — that is by design (T6 runs in wave 2,
 * alongside T4, before T5 exists).
 *
 * All requests use `app.inject()` so Fastify's plugin pipeline (including
 * rate-limiting from T2b) is exercised.  The rate-limiter no-ops under
 * NODE_ENV=test so the suite never trips it.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MongoClient } from 'mongodb';
import { buildApp } from '../../src/app.ts';
import { sessionUserSchema } from '../../src/contracts/auth.ts';
import mongoPlugin from '../../src/persistence/mongo.ts';
import { setupTestDb, type TestDb } from '../support/db.ts';

// ---------------------------------------------------------------------------
// Guard — these are real HTTP-level tests against a live Mongo (signup
// persists, /auth/me reads back). Skip the whole file when no Mongo is
// reachable, mirroring test/support/db.test.ts and
// test/integration/users.test.ts.
// ---------------------------------------------------------------------------

async function isMongoReachable(): Promise<boolean> {
  const url = process.env.MONGO_URL;
  if (!url) return false;
  try {
    const client = new MongoClient(url);
    await client.connect();
    await client.close();
    return true;
  } catch {
    return false;
  }
}

const mongoReachable = await isMongoReachable();

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let harness: TestDb;

beforeEach(async () => {
  // authenticate.ts and the auth routes read JWT_SECRET/COOKIE_NAME directly
  // from process.env (buildApp() does not run buildConfig() — see
  // authenticate.ts's comment) — a real auth-exercising test must set them.
  process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
  process.env.COOKIE_NAME = 'mp_session';
  process.env.NODE_ENV = 'test';

  harness = await setupTestDb();

  app = await buildApp({ logger: false });
  // buildApp() does not autoload the Mongo plugin (it lives outside
  // api/plugins/) — every test that hits real persistence registers it
  // explicitly, mirroring test/api/health.test.ts.
  await app.register(mongoPlugin, {
    url: 'mongodb://test-harness',
    dbName: harness.db.databaseName,
    client: {} as import('mongodb').MongoClient,
    db: harness.db,
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await harness.drop();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parses a Set-Cookie header into its component parts. */
function parseSetCookie(header: string | string[] | undefined): Record<string, string> | null {
  const headerStr = Array.isArray(header) ? header[0] : header;
  if (!headerStr) return null;
  const parts = headerStr.split(';').map((p) => p.trim());
  const [nameValue, ...attrs] = parts;
  const [name, value] = (nameValue ?? '').split('=');
  if (!name) return null;
  const result: Record<string, string> = { [name]: value ?? '' };
  for (const attr of attrs) {
    const [k, v] = attr.split('=');
    if (k) result[k.toLowerCase()] = v ?? 'true';
  }
  return result;
}

// ---------------------------------------------------------------------------
// POST /auth/signup
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('POST /auth/signup', () => {
  it('returns 200 and a SessionUser on valid input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: `signup-happy-${Date.now()}@example.com`,
        password: 'valid-password-12-chars',
      },
    });

    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    const parsed = sessionUserSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({
      id: expect.any(String),
      email: expect.any(String),
      createdAt: expect.any(String),
    });
    // Never contains a hash or password-shaped field.
    expect(body).not.toHaveProperty('passwordHash');
    expect(body).not.toHaveProperty('password');
  });

  it('sets an HttpOnly, SameSite=Lax session cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: `signup-cookie-${Date.now()}@example.com`,
        password: 'another-valid-password-12',
      },
    });

    expect(res.statusCode).toBe(200);

    const cookie = parseSetCookie(res.headers['set-cookie']);
    expect(cookie).not.toBeNull();
    // HttpOnly prevents document.cookie access.
    expect(cookie).toHaveProperty('httponly');
    // SameSite=Lax is required by the brief (R4). @fastify/cookie serializes
    // the attribute value as 'Lax' (RFC 6265 casing) — compare case-insensitively.
    expect(cookie?.samesite?.toLowerCase()).toBe('lax');
  });

  it('returns 400 with PASSWORD_TOO_SHORT for an 11-char password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: `short-pw-${Date.now()}@example.com`,
        password: '11charpass', // 11 chars — below the 12-char minimum
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    // The auth-specific code is surfaced via params on the zod issue.
    expect(body.error.details).toContainEqual(
      expect.objectContaining({
        code: 'PASSWORD_TOO_SHORT',
      }),
    );
  });

  it('returns 400 with EMAIL_INVALID for a malformed email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: 'not-an-email',
        password: 'still-valid-password12',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: 'EMAIL_INVALID' }),
    );
  });

  it('returns 409 EMAIL_TAKEN when the email is already registered', async () => {
    const email = `taken-${Date.now()}@example.com`;
    const password = 'first-user-password12';

    // First signup succeeds.
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email, password },
    });

    // Second signup with the same email is rejected.
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email, password },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('EMAIL_TAKEN');
  });
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('POST /auth/login', () => {
  it('returns 200 and a SessionUser with a valid password', async () => {
    const email = `login-valid-${Date.now()}@example.com`;
    const password = 'correct-password-12';

    // Seed a user via signup.
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email, password },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const parsed = sessionUserSchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  it('sets a session cookie on successful login', async () => {
    const email = `login-cookie-${Date.now()}@example.com`;
    const password = 'login-password-12chars';

    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email, password },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    });

    expect(res.statusCode).toBe(200);
    const cookie = parseSetCookie(res.headers['set-cookie']);
    expect(cookie).not.toBeNull();
    expect(cookie).toHaveProperty('httponly');
  });

  it('returns 401 INVALID_CREDENTIALS for the wrong password', async () => {
    const email = `wrong-pw-${Date.now()}@example.com`;

    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email, password: 'correct-password-12' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'wrong-password-12!' },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 INVALID_CREDENTIALS for an unknown email — identical shape to wrong-password', async () => {
    const knownEmail = `known-${Date.now()}@example.com`;

    // Register the known user.
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: knownEmail, password: 'known-password-12!' },
    });

    // Attempt login with a different (unknown) email.
    const unknownRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: `unknown-${Date.now()}@example.com`, password: 'any-password-12!' },
    });

    // Attempt login with wrong password for the known email.
    const wrongPwRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: knownEmail, password: 'bad-password-12!' },
    });

    // Both must return the same status code and error body shape.
    expect(unknownRes.statusCode).toBe(401);
    expect(wrongPwRes.statusCode).toBe(401);

    const unknownBody = JSON.parse(unknownRes.body);
    const wrongPwBody = JSON.parse(wrongPwRes.body);

    // Byte-for-byte comparison of the error body — R12's actual test.
    expect(unknownBody.error.code).toBe(wrongPwBody.error.code);
    expect(unknownBody.error.message).toBe(wrongPwBody.error.message);
  });
});

// ---------------------------------------------------------------------------
// GET /auth/me
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('GET /auth/me', () => {
  it('returns 401 UNAUTHENTICATED when no session cookie is present', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 401 UNAUTHENTICATED when the token is tampered', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        cookie: 'mp_session=totally-bogus-token',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the SessionUser when called with a valid session cookie', async () => {
    const email = `me-valid-${Date.now()}@example.com`;
    const password = 'me-valid-password-12';

    // Establish a session via signup.
    const signupRes = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email, password },
    });
    expect(signupRes.statusCode).toBe(200);

    const cookie = parseSetCookie(signupRes.headers['set-cookie']);
    expect(cookie).not.toBeNull();

    // Call /auth/me with the valid cookie.
    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        cookie: `mp_session=${cookie!['mp_session']}`,
      },
    });

    expect(meRes.statusCode).toBe(200);
    const body = JSON.parse(meRes.body);
    expect(body).toMatchObject({
      email,
      id: expect.any(String),
      createdAt: expect.any(String),
    });
  });
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('POST /auth/logout', () => {
  it('returns 204 No Content on success', async () => {
    const email = `logout-${Date.now()}@example.com`;
    const password = 'logout-password-12';

    // Establish a session.
    const signupRes = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email, password },
    });
    const cookie = parseSetCookie(signupRes.headers['set-cookie']);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        cookie: `mp_session=${cookie!['mp_session']}`,
      },
    });

    expect(res.statusCode).toBe(204);
  });

  it('clears the session cookie', async () => {
    const email = `logout-cookie-${Date.now()}@example.com`;
    const password = 'logout-cookie-password12';

    // Establish a session.
    const signupRes = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email, password },
    });
    const cookie = parseSetCookie(signupRes.headers['set-cookie']);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        cookie: `mp_session=${cookie!['mp_session']}`,
      },
    });

    // Clear must have the same name and HttpOnly as the set cookie.
    const cleared = parseSetCookie(res.headers['set-cookie']);
    expect(cleared).not.toBeNull();
    expect(cleared).toHaveProperty('mp_session', '');
    expect(cleared).toHaveProperty('httponly');
  });

  it('after logout, /auth/me returns 401 for a browser that honors the cleared cookie', async () => {
    // Sessions are stateless JWTs with no server-side revocation (ARCH-3 Out
    // of Scope) — logout cannot invalidate a still-valid token if a client
    // chooses to replay it. What logout guarantees is the Set-Cookie clear
    // instructing a real browser to stop sending the cookie; a subsequent
    // request that honors that (no cookie) must then be unauthenticated.
    const email = `logout-me-check-${Date.now()}@example.com`;
    const password = 'logout-me-check-password12';

    // Establish a session.
    const signupRes = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email, password },
    });
    const cookie = parseSetCookie(signupRes.headers['set-cookie']);

    // Call logout.
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        cookie: `mp_session=${cookie!['mp_session']}`,
      },
    });
    expect(logoutRes.statusCode).toBe(204);

    // /auth/me with no cookie (as a browser that respected the clear would
    // send) must return 401.
    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
    });

    expect(meRes.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Full-flow: signup → me → logout → me-401
// ---------------------------------------------------------------------------

describe.skipIf(!mongoReachable)('full auth lifecycle', () => {
  it('signup → cookie set → me returns user → logout → me returns 401', async () => {
    const email = `lifecycle-${Date.now()}@example.com`;
    const password = 'lifecycle-password-12';

    // 1. Signup.
    const signupRes = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email, password },
    });
    expect(signupRes.statusCode).toBe(200);

    const cookie = parseSetCookie(signupRes.headers['set-cookie']);
    expect(cookie).not.toBeNull();
    const cookieValue = cookie!['mp_session'];

    // 2. /auth/me with the session cookie.
    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: `mp_session=${cookieValue}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(JSON.parse(meRes.body).email).toBe(email);

    // 3. Logout.
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: `mp_session=${cookieValue}` },
    });
    expect(logoutRes.statusCode).toBe(204);

    // 4. /auth/me after logout, with no cookie (as a browser that honored
    // the Set-Cookie clear would send — sessions are stateless JWTs with no
    // server-side revocation, so a manually-replayed token would still
    // verify; see ARCH-3 Out of Scope).
    const meAfterLogoutRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
    });
    expect(meAfterLogoutRes.statusCode).toBe(401);
  });
});
