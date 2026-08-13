/**
 * Test factories — shared helpers for Phase 3–5 test suites.
 *
 * Provides an authenticated session cookie and valid document/line payloads.
 * All helpers are reused unmodified across all later phases.
 */

import type { FastifyInstance } from 'fastify';

/** A valid line for creating documents — Phase 1's PDF sample's first line. */
export const VALID_LINE = {
  description: 'Widget A',
  quantity: 2,
  unitPrice: 100.0,
  discount: { type: 'percent' as const, value: 10 },
  taxPercent: 5,
};

/** A minimal valid line with no discounts or tax. */
export const MINIMAL_LINE = {
  description: 'Service',
  quantity: 1,
  unitPrice: 50.0,
  discount: { type: 'none' as const },
  taxPercent: null,
};

/** Build a valid create-document payload with optional overrides. */
export function buildCreatePayload(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Test Document',
    customer: 'Acme Corp',
    issueDate: '2026-01-15',
    ...overrides,
  };
}

/** Build a valid line payload with optional overrides. */
export function buildLinePayload(overrides: Record<string, unknown> = {}) {
  return { ...VALID_LINE, ...overrides };
}

/**
 * Create an authenticated user and return their session cookie string.
 *
 * Uses POST /auth/signup directly so the cookie is valid for all routes.
 */
export async function createAuthenticatedUser(
  app: FastifyInstance,
  suffix?: string,
): Promise<string> {
  const email = `test-${suffix ?? Date.now()}@example.com`;
  const password = 'test-password-12chars';

  const signupRes = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { email, password },
  });

  if (signupRes.statusCode !== 200) {
    throw new Error(`Factory: failed to create authenticated user (${signupRes.statusCode})`);
  }

  const setCookie = signupRes.headers['set-cookie'];
  if (!setCookie) {
    throw new Error('Factory: no Set-Cookie header on signup');
  }

  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  return cookies.map((c) => c.split(';')[0]).join('; ');
}
