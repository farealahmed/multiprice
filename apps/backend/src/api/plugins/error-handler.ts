import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { mapToEnvelope } from '../errors/envelope-mapper.ts';

/**
 * THE error handler — registered once by autoload.
 *
 * Decision A6: nothing after Phase 0 adds a second one. Two handlers =
 * two envelope versions.
 *
 * Decision A3 (the `fp` rule): this file is the pattern-by-example. Every
 * later file in `src/api/plugins/` must also be wrapped in `fp` so hooks
 * (error handlers, guards, request id) apply app-wide rather than to the
 * plugin itself. Without `fp`, Fastify encapsulates the plugin and a guard
 * registered that way silently protects nothing.
 */

const errorHandlerPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.setErrorHandler((err, req, reply) => {
    const envelope = mapToEnvelope(err);

    // Status code: validation errors get 400; everything else gets 500.
    const statusCode =
      envelope.error.code === 'VALIDATION_FAILED' ? 400 : 500;

    // Log the underlying cause at error level. The cause is NEVER echoed
    // back to the client in the envelope — the message is generic.
    req.log.error({ err, code: envelope.error.code }, 'request failed');

    reply.code(statusCode).send(envelope);
  });
};

export default fp(errorHandlerPlugin, { name: 'error-handler' });