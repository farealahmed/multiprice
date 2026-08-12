import process from 'node:process';
import { buildApp } from './app.ts';
import { buildConfig, InvalidConfigError } from './config/index.ts';
import mongoPlugin from './persistence/mongo.ts';

/**
 * Boot the backend.
 *
 * Steps:
 * 1. Parse env via zod. Invalid env exits non-zero with a readable message
 *    — invalid config is never a request-time failure.
 * 2. Build the Fastify instance (no listening yet).
 * 3. Register the Mongo plugin with the live config. Boot-time connect
 *    failure is fatal (R12, A7).
 * 4. `app.ready()` flushes plugin registration so any registration error
 *    surfaces here.
 * 5. Listen on PORT, then wire SIGTERM/SIGINT to drain in-flight requests.
 */

async function main(): Promise<void> {
  let env;
  try {
    env = buildConfig();
  } catch (err) {
    if (err instanceof InvalidConfigError) {
      // eslint-disable-next-line no-console
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const app = await buildApp();

  // Register the live Mongo plugin. We do it here (not in buildApp) so
  // buildApp stays config-free and tests can stub the DB.
  await app.register(mongoPlugin, {
    url: env.MONGO_URL,
    dbName: env.MONGO_DB,
  });

  await app.ready();

  await app.listen({ port: env.PORT, host: '0.0.0.0' });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});