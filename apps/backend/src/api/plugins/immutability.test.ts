import Fastify, { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { ObjectId, type Collection, type Db, type Filter } from 'mongodb';
import fp from 'fastify-plugin';
import { GUARDED_ROUTES } from '../routes/registry.ts';
import { DOCUMENT_FINALIZED } from '../../contracts/lifecycle.ts';
import authenticatePlugin from './authenticate.ts';
import immutabilityPlugin, { type ImmutabilityPluginOptions } from './immutability.ts';

const TEST_SECRET = 'test-secret-that-is-at-least-32-bytes-long-for-hs256';
const COOKIE_NAME = 'mp_session';
const USER_ID = '64c0f6e8f5d1a2b3c4d5e6f7';
const OTHER_USER_ID = '64c0f6e8f5d1a2b3c4d5e6f8';

type StoredDocument = {
  _id: ObjectId;
  ownerId: string;
  status: 'draft' | 'finalized';
  lines: Array<unknown>;
  totals: unknown;
  updatedAt: Date;
  createdAt: Date;
  [key: string]: unknown;
};

// ─────────────────────────────────────────────────────────────────────────────
// Fake collection
// ─────────────────────────────────────────────────────────────────────────────

function createFakeCollection() {
  const findOneFilters: Filter<StoredDocument>[] = [];
  const documents = new Map<string, StoredDocument>();

  const collection = {
    findOne: async (
      filter: Filter<StoredDocument>,
    ): Promise<StoredDocument | null> => {
      findOneFilters.push(filter as Filter<StoredDocument>);
      const idFilter = (filter._id as ObjectId | undefined)?.toString();
      if (idFilter && documents.has(idFilter)) {
        const doc = documents.get(idFilter)!;
        if (
          (filter.ownerId === undefined || filter.ownerId === doc.ownerId) &&
          (filter.status === undefined || filter.status === doc.status)
        ) {
          return doc;
        }
      }
      return null;
    },
    _setDocument(doc: StoredDocument) {
      documents.set(doc._id.toString(), doc);
    },
    _getFindOneFilters() {
      return findOneFilters.slice();
    },
    _clear() {
      documents.clear();
      findOneFilters.length = 0;
    },
  } as unknown as Collection<StoredDocument> & {
    _setDocument(doc: StoredDocument): void;
    _getFindOneFilters(): Filter<StoredDocument>[];
    _clear(): void;
  };

  return collection;
}

function createFakeDb(
  collection: ReturnType<typeof createFakeCollection>,
): Db {
  return {
    collection: () => collection,
  } as unknown as Db;
}

function makeDoc(overrides: Partial<StoredDocument> = {}): StoredDocument {
  const id = new ObjectId();
  return {
    _id: id,
    ownerId: USER_ID,
    status: 'draft',
    lines: [{ quantity: 1, description: 'Test line', unitPrice: 100 }],
    totals: { grandTotal: 100 },
    updatedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// App builder — registers plugins explicitly (no autoload) to keep the test
// module itself out of the plugin tree. Follows rate-limit.test.ts's pattern.
// ─────────────────────────────────────────────────────────────────────────────

async function buildTestApp(opts: ImmutabilityPluginOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  process.env.JWT_SECRET = TEST_SECRET;
  process.env.COOKIE_NAME = COOKIE_NAME;
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URL = 'mongodb://localhost:27017';
  process.env.MONGO_DB = 'multiprice';

  await app.register(authenticatePlugin);
  await app.register(immutabilityPlugin, opts);

  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildTestApp({ skipBootCheck: true });
});

afterEach(async () => {
  await app?.close();
});

function signToken(sub: string): string {
  return app.jwt.sign({ sub });
}

function injectAuth(method: string, url: string, userId = USER_ID) {
  const token = signToken(userId);
  return app.inject({
    method: method as never,
    url,
    headers: { cookie: `${COOKIE_NAME}=${token}` },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard behavior (R7, R9)
// ─────────────────────────────────────────────────────────────────────────────

describe('immutability guard', () => {
  it('rejects a write to a finalized, owned document with 409 DOCUMENT_FINALIZED', async () => {
    const fakeCollection = createFakeCollection();
    const finalized = makeDoc({ ownerId: USER_ID, status: 'finalized' });
    fakeCollection._setDocument(finalized);
    (app as FastifyInstance & { db: Db }).db = createFakeDb(fakeCollection);

    app.patch('/api/v1/documents/:id', { preHandler: app.authenticate }, async () => ({ ok: true }));
    await app.ready();

    const res = await injectAuth('PATCH', `/api/v1/documents/${finalized._id}`);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: {
        code: DOCUMENT_FINALIZED,
        message: expect.stringContaining('finalized'),
      },
    });
  });

  it('allows a write to a draft document through to the handler', async () => {
    const fakeCollection = createFakeCollection();
    const draft = makeDoc({ ownerId: USER_ID, status: 'draft' });
    fakeCollection._setDocument(draft);
    (app as FastifyInstance & { db: Db }).db = createFakeDb(fakeCollection);

    let handlerRan = false;
    app.patch('/api/v1/documents/:id', { preHandler: app.authenticate }, async () => {
      handlerRan = true;
      return { ok: true };
    });
    await app.ready();

    const res = await injectAuth('PATCH', `/api/v1/documents/${draft._id}`);

    expect(res.statusCode).toBe(200);
    expect(handlerRan).toBe(true);
  });

  it('a foreign document is 404, never 409', async () => {
    const fakeCollection = createFakeCollection();
    const foreign = makeDoc({ ownerId: OTHER_USER_ID, status: 'finalized' });
    fakeCollection._setDocument(foreign);
    (app as FastifyInstance & { db: Db }).db = createFakeDb(fakeCollection);

    app.patch('/api/v1/documents/:id', { preHandler: app.authenticate }, async () => ({ ok: true }));
    await app.ready();

    const res = await injectAuth('PATCH', `/api/v1/documents/${foreign._id}`, USER_ID);

    expect(res.statusCode).toBe(404);
  });

  it('a missing document is 404, never 409', async () => {
    const fakeCollection = createFakeCollection();
    (app as FastifyInstance & { db: Db }).db = createFakeDb(fakeCollection);

    app.patch('/api/v1/documents/:id', { preHandler: app.authenticate }, async () => ({ ok: true }));
    await app.ready();

    const missingId = new ObjectId().toString();
    const res = await injectAuth('PATCH', `/api/v1/documents/${missingId}`);

    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ordering (R22): guard runs AFTER authenticate, not before
// ─────────────────────────────────────────────────────────────────────────────

describe('guard ordering (R22)', () => {
  it('an unauthenticated request to a guarded route on a finalized document still gets 401, not 409', async () => {
    const fakeCollection = createFakeCollection();
    const finalized = makeDoc({ ownerId: USER_ID, status: 'finalized' });
    fakeCollection._setDocument(finalized);
    (app as FastifyInstance & { db: Db }).db = createFakeDb(fakeCollection);

    app.patch('/api/v1/documents/:id', { preHandler: app.authenticate }, async () => ({ ok: true }));
    await app.ready();

    // No auth cookie → 401, not 409
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${finalized._id}`,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reach (R8): guard does not affect non-guarded routes
// ─────────────────────────────────────────────────────────────────────────────

describe('guard reach (R8)', () => {
  it('a non-guarded route is unaffected — no findOne called', async () => {
    const fakeCollection = createFakeCollection();
    const draft = makeDoc({ ownerId: USER_ID, status: 'draft' });
    fakeCollection._setDocument(draft);
    (app as FastifyInstance & { db: Db }).db = createFakeDb(fakeCollection);

    // A route that is NOT in GUARDED_ROUTES
    app.get('/api/v1/prices/calculate', { preHandler: app.authenticate }, async () => ({ ok: true }));
    await app.ready();

    const res = await injectAuth('GET', '/api/v1/prices/calculate');

    expect(res.statusCode).toBe(200);
    expect(fakeCollection._getFindOneFilters()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Boot-time cross-check (R8)
// ─────────────────────────────────────────────────────────────────────────────

describe('boot-time guard registry cross-check (R8)', () => {
  beforeEach(async () => {
    app = await buildTestApp();
  });

  it('boots cleanly when every mutating existing-document route has a registry entry', async () => {
    // Register all six actual GUARDED_ROUTES
    app.patch('/api/v1/documents/:id', { preHandler: app.authenticate }, async () => ({}));
    app.delete('/api/v1/documents/:id', { preHandler: app.authenticate }, async () => ({}));
    app.post('/api/v1/documents/:id/lines', { preHandler: app.authenticate }, async () => ({}));
    app.patch('/api/v1/documents/:id/lines/:lineId', { preHandler: app.authenticate }, async () => ({}));
    app.delete('/api/v1/documents/:id/lines/:lineId', { preHandler: app.authenticate }, async () => ({}));
    app.post('/api/v1/documents/:id/finalize', { preHandler: app.authenticate }, async () => ({}));

    // Should not throw
    await app.ready();
  });

  it('fails to boot when a candidate mutating route has no registry entry', async () => {
    // Register all six real routes PLUS an extra mutation-like route absent from GUARDED_ROUTES
    app.patch('/api/v1/documents/:id', { preHandler: app.authenticate }, async () => ({}));
    app.delete('/api/v1/documents/:id', { preHandler: app.authenticate }, async () => ({}));
    app.post('/api/v1/documents/:id/lines', { preHandler: app.authenticate }, async () => ({}));
    app.patch('/api/v1/documents/:id/lines/:lineId', { preHandler: app.authenticate }, async () => ({}));
    app.delete('/api/v1/documents/:id/lines/:lineId', { preHandler: app.authenticate }, async () => ({}));
    app.post('/api/v1/documents/:id/finalize', { preHandler: app.authenticate }, async () => ({}));
    app.put('/api/v1/documents/:id/archive', { preHandler: app.authenticate }, async () => ({}));

    await expect(app.ready()).rejects.toThrow(/PUT.*\/api\/v1\/documents\/:id\/archive/);
  });

  it('fails to boot when a GUARDED_ROUTES entry has no matching registered route', async () => {
    // Register only five of six GUARDED_ROUTES — deliberately omit DELETE /api/v1/documents/:id
    app.patch('/api/v1/documents/:id', { preHandler: app.authenticate }, async () => ({}));
    // DELETE /api/v1/documents/:id deliberately omitted
    app.post('/api/v1/documents/:id/lines', { preHandler: app.authenticate }, async () => ({}));
    app.patch('/api/v1/documents/:id/lines/:lineId', { preHandler: app.authenticate }, async () => ({}));
    app.delete('/api/v1/documents/:id/lines/:lineId', { preHandler: app.authenticate }, async () => ({}));
    app.post('/api/v1/documents/:id/finalize', { preHandler: app.authenticate }, async () => ({}));

    await expect(app.ready()).rejects.toThrow(/DELETE.*\/api\/v1\/documents\/:id/);
  });
});
