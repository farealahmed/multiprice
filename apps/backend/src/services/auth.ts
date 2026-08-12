import * as argon2 from 'argon2';
import type { ObjectId } from 'mongodb';
import {
  EMAIL_TAKEN,
  INVALID_CREDENTIALS,
  type SignupInput,
  type LoginInput,
  type SessionUser,
} from '../contracts/auth.ts';
import type { UsersRepository } from '../persistence/users.repository.ts';
import type { User } from '../domain/user.ts';

export interface AuthServiceDependencies {
  users: UsersRepository;
  /** Returns a signed session token for the given subject (user id). */
  signToken(payload: { sub: string }): string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toSessionUser(user: User): SessionUser {
  return {
    id: user._id.toHexString(),
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    error != null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 11000
  );
}

/**
 * Lazily-computed argon2 hash used to keep unknown-email login attempts doing
 * the same amount of work as wrong-password attempts. A real hash is required:
 * a placeholder string would make argon2.verify throw instead of running.
 */
let dummyHashPromise: Promise<string> | undefined;
async function dummyHash(): Promise<string> {
  dummyHashPromise ??= argon2.hash('dummy-password-for-timing-defense');
  return dummyHashPromise;
}

export async function signup(
  input: SignupInput,
  deps: AuthServiceDependencies,
): Promise<{ user: SessionUser; token: string }> {
  const email = normalizeEmail(input.email);
  const passwordHash = await argon2.hash(input.password);

  let insertedId: ObjectId;
  try {
    const result = await deps.users.create({
      email,
      passwordHash,
      createdAt: new Date(),
    });
    insertedId = result.insertedId;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw { code: EMAIL_TAKEN };
    }
    throw error;
  }

  const user: User = {
    _id: insertedId,
    email,
    passwordHash,
    createdAt: new Date(),
  };

  const token = deps.signToken({ sub: insertedId.toHexString() });
  return { user: toSessionUser(user), token };
}

export async function login(
  input: LoginInput,
  deps: AuthServiceDependencies,
): Promise<{ user: SessionUser; token: string }> {
  const email = normalizeEmail(input.email);
  const user = await deps.users.findByEmail(email);

  const hashToVerify = user?.passwordHash ?? (await dummyHash());
  const verified = await argon2.verify(hashToVerify, input.password);

  if (!verified || user == null) {
    throw { code: INVALID_CREDENTIALS };
  }

  const token = deps.signToken({ sub: user._id.toHexString() });
  return { user: toSessionUser(user), token };
}
