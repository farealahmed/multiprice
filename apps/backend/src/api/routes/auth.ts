import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  EMAIL_TAKEN,
  INVALID_CREDENTIALS,
  UNAUTHENTICATED,
  loginInputSchema,
  sessionUserSchema,
  signupInputSchema,
} from '../../contracts/auth.ts';
import { createUsersRepository } from '../../persistence/users.repository.ts';
import { login, signup } from '../../services/auth.ts';
import type { User } from '../../domain/user.ts';

function toSessionUser(user: User) {
  return {
    id: user._id.toHexString(),
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

function getDomainCode(error: unknown): string | undefined {
  if (error != null && typeof error === 'object' && 'code' in error) {
    return (error as { code: unknown }).code as string;
  }
  return undefined;
}

const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;

const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Cookie name and security flags come from the environment. `server.ts`
  // validates the full configuration at boot via `buildConfig()`; the route
  // reads the values directly so tests that build the app without auth env
  // still pass when they do not exercise auth endpoints.
  const cookieName = process.env.COOKIE_NAME ?? 'mp_session';
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
    maxAge: SEVEN_DAYS_IN_SECONDS,
  };

  app.post('/auth/signup', async (request, reply) => {
    const input = signupInputSchema.parse(request.body);
    const users = createUsersRepository(app.db);

    try {
      const { user, token } = await signup(input, {
        users,
        signToken: (payload) => app.jwt.sign(payload),
      });

      reply.setCookie(cookieName, token, cookieOptions);
      return reply.code(200).send(sessionUserSchema.parse(user));
    } catch (error) {
      if (getDomainCode(error) === EMAIL_TAKEN) {
        return reply.code(409).send({
          error: {
            code: EMAIL_TAKEN,
            message: 'Email is already registered',
          },
        });
      }
      throw error;
    }
  });

  app.post('/auth/login', async (request, reply) => {
    const input = loginInputSchema.parse(request.body);
    const users = createUsersRepository(app.db);

    try {
      const { user, token } = await login(input, {
        users,
        signToken: (payload) => app.jwt.sign(payload),
      });

      reply.setCookie(cookieName, token, cookieOptions);
      return reply.code(200).send(sessionUserSchema.parse(user));
    } catch (error) {
      if (getDomainCode(error) === INVALID_CREDENTIALS) {
        return reply.code(401).send({
          error: {
            code: INVALID_CREDENTIALS,
            message: 'Invalid credentials',
          },
        });
      }
      throw error;
    }
  });

  app.post('/auth/logout', { preHandler: app.authenticate }, async (_request, reply) => {
    reply.clearCookie(cookieName, cookieOptions);
    return reply.code(204).send();
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (request, reply) => {
    const users = createUsersRepository(app.db);
    const user = await users.findById(request.userId!);

    if (!user) {
      return reply.code(401).send({
        error: {
          code: UNAUTHENTICATED,
          message: 'Authentication required',
        },
      });
    }

    return reply.code(200).send(sessionUserSchema.parse(toSessionUser(user)));
  });
};

export default authRoutes;
