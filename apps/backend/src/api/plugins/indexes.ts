import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

/**
 * Central registry for boot-time collection indexes. Add new collection
 * indexes here so they are established before any request can use them.
 */
const indexDefinitions = [
  {
    collection: 'users',
    key: { email: 1 },
    options: { unique: true },
  },
] as const;

const indexesPlugin: FastifyPluginAsync = async (app) => {
  // `buildApp()` autoloads this plugin before callers can register mongo.
  // Waiting for `ready()` lets server startup and tests decorate `app.db`
  // first, while retaining boot-time index creation for a live database.
  app.addHook('onReady', async () => {
    if (!app.hasDecorator('db') || typeof app.db.collection !== 'function') {
      return;
    }

    await Promise.all(
      indexDefinitions.map(({ collection, key, options }) =>
        app.db.collection(collection).createIndex(key, options),
      ),
    );
  });
};

export default fp(indexesPlugin, { name: 'indexes' });
