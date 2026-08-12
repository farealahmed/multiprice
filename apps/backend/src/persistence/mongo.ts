import fp from 'fastify-plugin';
import { MongoClient, type Db, type MongoClientOptions } from 'mongodb';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

/**
 * Mongo persistence plugin — Lane 0-A owns this file.
 *
 * Decorates the Fastify instance with `app.mongo` (MongoClient) and
 * `app.db` (default Db). Closes the client on app shutdown.
 *
 * Boot invariant (R12, A7): connection failure at boot is fatal
 * (the plugin throws and `app.ready()` rejects). Connection loss at
 * runtime is not — the driver reconnects on the next operation.
 *
 * Test injection: tests pass `client: <prebuilt MongoClient>` to skip the
 * connect path, or `db: <stub Db>` to provide a fake `db.command` for
 * the health route without a real Mongo.
 */

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(here, '..', '..', 'package.json');

/** Reads the backend version from package.json. Falls back to 'unknown'. */
export async function readBackendVersion(): Promise<string> {
  try {
    const raw = await readFile(pkgPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    mongo: MongoClient;
    db: Db;
    backendVersion: string;
  }
}

export interface MongoPluginOptions {
  url: string;
  dbName: string;
  /** Test seam: inject a prebuilt client (skips connect). */
  client?: MongoClient;
  /** Test seam: override the db decoration (skips real client connect). */
  db?: Db;
  /** Test seam: skip reading package.json for `backendVersion`. */
  version?: string;
  /** Passed through to MongoClient when we instantiate it ourselves. */
  clientOptions?: MongoClientOptions;
}

const mongoPlugin: FastifyPluginAsync<MongoPluginOptions> = async (app, opts) => {
  const version = opts.version ?? (await readBackendVersion());

  if (opts.client && opts.db) {
    // Test path: caller owns the client; we just decorate.
    app.decorate('mongo', opts.client);
    app.decorate('db', opts.db);
    app.decorate('backendVersion', version);
    return;
  }

  if (!opts.url) throw new Error('mongo plugin: `url` is required');
  if (!opts.dbName) throw new Error('mongo plugin: `dbName` is required');

  const client = new MongoClient(opts.url, opts.clientOptions);
  // Boot-fatal: reject here so `app.ready()` rejects and `server.ts` exits.
  await client.connect();

  app.decorate('mongo', client);
  app.decorate('db', client.db(opts.dbName));
  app.decorate('backendVersion', version);

  app.addHook('onClose', async () => {
    await client.close();
  });
};

export default fp(mongoPlugin, { name: 'mongo' });