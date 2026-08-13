import fp from 'fastify-plugin';
import { ObjectId } from 'mongodb';
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
  RouteOptions,
} from 'fastify';
import { GUARDED_ROUTES, type GuardedRoute } from '../routes/registry.ts';
import { DOCUMENT_FINALIZED } from '../../contracts/lifecycle.ts';
import { DOCUMENT_NOT_FOUND } from '../../contracts/document.ts';

export interface ImmutabilityPluginOptions {
  /** Disables the boot-time registry cross-check. Useful for unit tests that
   *  register only the route whose guard behavior they exercise. */
  skipBootCheck?: boolean;
}

interface RecordedRoute {
  method: string;
  path: string;
}

const recordedRoutesMap = new WeakMap<FastifyInstance, RecordedRoute[]>();

function normalizeMethod(method: RouteOptions['method']): string {
  if (Array.isArray(method)) return method.map((m) => String(m).toUpperCase()).join(',');
  return String(method).toUpperCase();
}

function matchesRoute(guarded: GuardedRoute, method: string, path: string): boolean {
  if (guarded.method !== method) return false;
  const guardedSegs = guarded.path.split('/');
  const pathSegs = path.split('/');
  if (guardedSegs.length !== pathSegs.length) return false;
  return guardedSegs.every((seg, i) =>
    seg.startsWith(':') ? pathSegs[i] !== undefined : seg === pathSegs[i],
  );
}

function isGuardedRoute(method: string, path: string): boolean {
  return GUARDED_ROUTES.some((guarded) => matchesRoute(guarded, method, path));
}

function isCandidateMutationRoute(method: string, path: string): boolean {
  // POST /api/v1/documents creates a new document; it is not an existing-document mutation.
  if (method === 'POST' && path === '/api/v1/documents') return false;
  // POST /api/v1/documents/:id/duplicate creates a new draft from the source;
  // it never mutates the source document, so it must stay reachable on a
  // finalized source rather than being locked behind the immutability guard.
  if (method === 'POST' && path === '/api/v1/documents/:id/duplicate') return false;
  return (
    ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) && path.startsWith('/api/v1/documents/:id')
  );
}

const immutabilityGuard: preHandlerHookHandler = async (request, reply) => {
  const app = request.server;
  const id = (request.params as { id?: string }).id;
  const ownerId = request.userId;

  if (!id || !ownerId) {
    return reply.code(404).send({
      error: { code: DOCUMENT_NOT_FOUND, message: 'Document not found' },
    });
  }

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return reply.code(404).send({
      error: { code: DOCUMENT_NOT_FOUND, message: 'Document not found' },
    });
  }

  const collection = app.db.collection<{
    _id: ObjectId;
    ownerId: string;
    status: 'draft' | 'finalized';
  }>('documents');

  const document = await collection.findOne({ _id: objectId, ownerId });

  if (!document) {
    return reply.code(404).send({
      error: { code: DOCUMENT_NOT_FOUND, message: 'Document not found' },
    });
  }

  if (document.status === 'finalized') {
    return reply.code(409).send({
      error: {
        code: DOCUMENT_FINALIZED,
        message: `Document ${id} is finalized and cannot be modified`,
      },
    });
  }
};

function appendGuardPreHandler(opts: RouteOptions): void {
  const existing = opts.preHandler;
  if (existing == null) {
    opts.preHandler = immutabilityGuard;
  } else if (Array.isArray(existing)) {
    existing.push(immutabilityGuard);
  } else {
    opts.preHandler = [existing, immutabilityGuard];
  }
}

const immutabilityPlugin: FastifyPluginAsync<ImmutabilityPluginOptions> = async (
  app,
  opts,
) => {
  recordedRoutesMap.set(app, []);

  app.addHook('onRoute', (opts) => {
    const method = normalizeMethod(opts.method);
    const path = opts.url ?? '';
    const routes = recordedRoutesMap.get(app)!;

    routes.push({ method, path });

    if (isGuardedRoute(method, path)) {
      appendGuardPreHandler(opts);
    }
  });

  if (opts.skipBootCheck) return;

  app.addHook('onReady', async () => {
    const routes = recordedRoutesMap.get(app)!;

    // Direction 1: every GUARDED_ROUTES entry must have a matching registered route.
    for (const guarded of GUARDED_ROUTES) {
      const registered = routes.some(({ method, path }) =>
        matchesRoute(guarded, method, path),
      );
      if (!registered) {
        throw new Error(
          `Boot check failed: GUARDED_ROUTES entry ${guarded.method} ${guarded.path} has no matching registered route.`,
        );
      }
    }

    // Direction 2: every candidate existing-document mutation must be listed in GUARDED_ROUTES.
    for (const { method, path } of routes) {
      if (isCandidateMutationRoute(method, path) && !isGuardedRoute(method, path)) {
        throw new Error(
          `Boot check failed: mutating route ${method} ${path} has no GUARDED_ROUTES entry.`,
        );
      }
    }
  });
};

export default fp(immutabilityPlugin, { name: 'immutability' });
