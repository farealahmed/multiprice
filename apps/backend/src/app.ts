// Every file in src/api/plugins/ must be wrapped in fastify-plugin (fp).
// Without it, Fastify encapsulates the plugin and its hooks apply only to
// the plugin itself — a guard registered that way silently protects
// nothing. This is exactly how Phase 4's immutability guard reaches
// Phase 3's routes, and how Phase 2's index bootstrap runs at boot. The
// pattern is set by example in plugins/error-handler.ts.
//
// Autoload order (R2): plugins load first, then routes. Routes depend on
// hooks installed by plugins (error handler, request id, future auth).
//
// This file is owned by Lane 0-A and never edited again. Every later
// lane (1-B, 2-A, 3-A, 4-A, 5-A, 4-D) drops files into `src/api/plugins/`
// or `src/api/routes/` and they go live without touching this file.

import Fastify, { type FastifyInstance } from 'fastify';
import autoload from '@fastify/autoload';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildLoggerOptions, genReqId } from './observability/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = join(here, 'api');

export interface BuildAppOptions {
  /** Disable the real Mongo plugin; tests inject a stub. */
  skipMongoPlugin?: boolean;
  /** Logger override — used by tests to capture logs. */
  logger?: ReturnType<typeof buildLoggerOptions> | boolean;
}

/**
 * Build a Fastify instance. Does NOT listen — tests use `app.inject()`,
 * and `server.ts` calls `app.listen()` after wiring shutdown handlers.
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? buildLoggerOptions(),
    genReqId,
  });

  // Plugins load first — their hooks must apply to routes.
  await app.register(autoload, {
    dir: join(apiDir, 'plugins'),
    forceESM: true,
  });

  await app.register(autoload, {
    dir: join(apiDir, 'routes'),
    forceESM: true,
  });

  return app;
}