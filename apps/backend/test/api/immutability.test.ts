/**
 * T6 — Lifecycle immutability evidence.
 *
 * These tests exercise the full Fastify pipeline. A direct database update marks
 * a fixture finalized solely to establish the protected state before issuing the
 * API request; production writes cannot create this state once the guard exists.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MongoClient, ObjectId } from 'mongodb';

import { buildApp } from '../../src/app.ts';
import { GUARDED_ROUTES } from '../../src/api/routes/registry.ts';
import mongoPlugin from '../../src/persistence/mongo.ts';
import { setupTestDb, type TestDb } from '../support/db.ts';
import {
  buildCreatePayload,
  buildLinePayload,
  createAuthenticatedUser,
} from '../support/factories.ts';

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

let app: FastifyInstance;
let harness: TestDb;

beforeEach(async () => {
  process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
  process.env.COOKIE_NAME = 'mp_session';
  process.env.NODE_ENV = 'test';

  harness = await setupTestDb();
  app = await buildApp({ logger: false });
  await app.register(mongoPlugin, {
    url: 'mongodb://test-harness',
    dbName: harness.db.databaseName,
    client: {} as MongoClient,
    db: harness.db,
  });
  await app.ready();
});

afterEach(async () => {
  if (app) await app.close();
  if (harness) await harness.drop();
});

type FinalizedFixture = { id: string; lineId: string };

async function createFinalizedDocument(cookie: string): Promise<FinalizedFixture> {
  const create = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: { cookie },
    payload: buildCreatePayload({ lines: [buildLinePayload()] }),
  });
  expect(create.statusCode).toBe(201);

  const document = create.json() as { id: string; lines: Array<{ id: string }> };
  const line = document.lines[0];
  if (!line) throw new Error('Expected a line on finalized fixture');

  // Test-only state seeding: normal document routes must never accept this write.
  const result = await harness.db.collection('documents').updateOne(
    { _id: new ObjectId(document.id) },
    { $set: { status: 'finalized' } },
  );
  expect(result.modifiedCount).toBe(1);

  return { id: document.id, lineId: line.id };
}

function requestForGuardedRoute(
  route: { method: string; path: string },
  fixture: FinalizedFixture,
): { url: string; payload?: Record<string, unknown> } {
  const url = route.path
    .replace(':id', fixture.id)
    .replace(':lineId', fixture.lineId);

  switch (route.path) {
    case '/api/v1/documents/:id':
      return route.method === 'PATCH'
        ? { url, payload: { title: 'Attempted finalized mutation' } }
        : { url };
    case '/api/v1/documents/:id/lines':
      return { url, payload: buildLinePayload({ description: 'Attempted appended line' }) };
    case '/api/v1/documents/:id/lines/:lineId':
      return route.method === 'PATCH'
        ? { url, payload: { description: 'Attempted line mutation' } }
        : { url };
    case '/api/v1/documents/:id/finalize':
      return { url };
    default:
      throw new Error(`No valid request fixture for ${route.method} ${route.path}`);
  }
}

function invalidRequestForGuardedRoute(
  route: { method: string; path: string },
  fixture: FinalizedFixture,
): { url: string; payload?: Record<string, unknown> } {
  const url = route.path
    .replace(':id', fixture.id)
    .replace(':lineId', fixture.lineId);

  switch (route.path) {
    case '/api/v1/documents/:id':
      return route.method === 'PATCH' ? { url, payload: { totals: {} } } : { url };
    case '/api/v1/documents/:id/lines':
      return { url, payload: {} };
    case '/api/v1/documents/:id/lines/:lineId':
      return route.method === 'PATCH' ? { url, payload: { quantity: 'invalid' } } : { url };
    case '/api/v1/documents/:id/finalize':
      return { url };
    default:
      throw new Error(`No invalid request fixture for ${route.method} ${route.path}`);
  }
}

describe.skipIf(!mongoReachable)('finalized documents are immutable', () => {
  it.each(GUARDED_ROUTES)('$method $path rejects a valid mutation without changing the document', async (route) => {
    const cookie = await createAuthenticatedUser(app, `immutable-${route.method}-${route.path}`);
    const fixture = await createFinalizedDocument(cookie);
    const before = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${fixture.id}`,
      headers: { cookie },
    });
    expect(before.statusCode).toBe(200);

    const request = requestForGuardedRoute(route, fixture);
    const response = await app.inject({
      method: route.method as 'POST' | 'PATCH' | 'DELETE',
      url: request.url,
      headers: { cookie },
      ...(request.payload === undefined ? {} : { payload: request.payload }),
    });

    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: { code: string } }).error.code).toBe('DOCUMENT_FINALIZED');

    const after = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${fixture.id}`,
      headers: { cookie },
    });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toEqual(before.json());
  });

  it.each(GUARDED_ROUTES)('$method $path rejects invalid bodies before validation can run', async (route) => {
    const cookie = await createAuthenticatedUser(app, `immutable-invalid-${route.method}-${route.path}`);
    const fixture = await createFinalizedDocument(cookie);
    const request = invalidRequestForGuardedRoute(route, fixture);

    const response = await app.inject({
      method: route.method as 'POST' | 'PATCH' | 'DELETE',
      url: request.url,
      headers: { cookie },
      ...(request.payload === undefined ? {} : { payload: request.payload }),
    });

    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: { code: string } }).error.code).toBe('DOCUMENT_FINALIZED');
  });

  it('leaves GET and document creation unguarded', async () => {
    const cookie = await createAuthenticatedUser(app, 'immutable-non-guarded');
    const fixture = await createFinalizedDocument(cookie);

    const getResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${fixture.id}`,
      headers: { cookie },
    });
    expect(getResponse.statusCode).toBe(200);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: buildCreatePayload(),
    });
    expect(createResponse.statusCode).toBe(201);
  });
});

