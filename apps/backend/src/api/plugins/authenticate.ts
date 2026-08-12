import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { UNAUTHENTICATED } from '../../contracts/auth.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `app.authenticate` for routes that opt in to session verification. */
    userId?: string;
  }

  interface FastifyInstance {
    /** Opt-in preHandler: verify the session JWT and decorate `request.userId`. */
    authenticate: preHandlerHookHandler;
  }
}

const SEVEN_DAYS = '7d';

const authenticatePlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // `server.ts` validates the full env via `buildConfig()` at boot, so the
  // plugin reads the auth-specific values directly. This keeps apps built for
  // unrelated tests (health, pricing preview) from failing when those tests do
  // not set a session secret.
  const jwtSecret = process.env.JWT_SECRET;
  const cookieName = process.env.COOKIE_NAME ?? 'mp_session';

  if (jwtSecret) {
    await app.register(cookie);
    await app.register(jwt, {
      secret: jwtSecret,
      cookie: {
        cookieName,
        signed: false,
      },
      sign: {
        expiresIn: SEVEN_DAYS,
      },
    });
  }

  app.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!jwtSecret) {
        return reply.code(401).send({
          error: {
            code: UNAUTHENTICATED,
            message: 'Authentication required',
          },
        });
      }

      try {
        await request.jwtVerify();
        const payload = request.user as { sub?: unknown };
        if (typeof payload?.sub !== 'string') {
          throw new Error('missing subject');
        }
        request.userId = payload.sub;
      } catch {
        return reply.code(401).send({
          error: {
            code: UNAUTHENTICATED,
            message: 'Authentication required',
          },
        });
      }
    },
  );
};

export default fp(authenticatePlugin, { name: 'authenticate' });
