import { describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';

const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }));

vi.mock('argon2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('argon2')>();
  return {
    ...actual,
    verify: async (digest: string, password: string) => {
      verifyMock(digest, password);
      return actual.verify(digest, password);
    },
  };
});

import * as argon2 from 'argon2';
import { createSigner, createDecoder } from 'fast-jwt';
import { signup, login } from './auth.ts';
import {
  EMAIL_TAKEN,
  INVALID_CREDENTIALS,
  type SignupInput,
  type LoginInput,
} from '../contracts/auth.ts';
import type { UsersRepository } from '../persistence/users.repository.ts';
import type { User } from '../domain/user.ts';

const TEST_SECRET = 'test-secret-that-is-at-least-32-bytes-long-for-hs256';
const signToken = createSigner({ key: TEST_SECRET, expiresIn: '7d' });
const decodeToken = createDecoder();

type CreateInput = Parameters<UsersRepository['create']>[0];

function createFakeUsersRepository({ onCreate }: { onCreate?: () => void } = {}): {
  repository: UsersRepository;
  created: CreateInput[];
  docs: User[];
} {
  const created: CreateInput[] = [];
  const docs: User[] = [];

  const repository: UsersRepository = {
    create: async (input) => {
      created.push(input);
      onCreate?.();
      const _id = new ObjectId();
      docs.push({ _id, ...input });
      return { insertedId: _id };
    },
    findByEmail: async (email) => docs.find((u) => u.email === email) ?? null,
    findById: async (id) => docs.find((u) => u._id.toHexString() === id) ?? null,
  };

  return { repository, created, docs };
}

function makeSignupInput(overrides: Partial<SignupInput> = {}): SignupInput {
  return {
    email: 'test@example.com',
    password: 'correct horse battery staple',
    ...overrides,
  };
}

function makeLoginInput(overrides: Partial<LoginInput> = {}): LoginInput {
  return {
    email: 'test@example.com',
    password: 'correct horse battery staple',
    ...overrides,
  };
}

describe('auth service — signup', () => {
  it('hashes the password with argon2id and never returns the hash', async () => {
    const { repository, created } = createFakeUsersRepository();
    const input = makeSignupInput();

    const result = await signup(input, { users: repository, signToken });

    expect(result.user).toEqual({
      id: expect.any(String),
      email: 'test@example.com',
      createdAt: expect.any(String),
    });
    expect(result.token).toEqual(expect.any(String));
    expect(created).toHaveLength(1);
    const stored = created[0]!;
    expect(stored.passwordHash).not.toBe(input.password);
    expect(stored.passwordHash).toContain('$argon2id$');
    expect(await argon2.verify(stored.passwordHash, input.password)).toBe(true);
  });

  it('maps a duplicate-key error to EMAIL_TAKEN', async () => {
    const { repository } = createFakeUsersRepository({
      onCreate: () => {
        const error = Object.assign(new Error('duplicate key'), { code: 11000 });
        throw error;
      },
    });

    await expect(signup(makeSignupInput(), { users: repository, signToken })).rejects.toEqual({
      code: EMAIL_TAKEN,
    });
  });
});

describe('auth service — login', () => {
  it('succeeds with the correct password', async () => {
    const { repository } = createFakeUsersRepository();
    const signupInput = makeSignupInput();
    const signupResult = await signup(signupInput, { users: repository, signToken });

    const loginResult = await login(makeLoginInput(), { users: repository, signToken });

    expect(loginResult.user.id).toBe(signupResult.user.id);
    expect(loginResult.user.email).toBe(signupResult.user.email);
    expect(loginResult.token).toEqual(expect.any(String));
  });

  it('throws INVALID_CREDENTIALS with the wrong password', async () => {
    const { repository } = createFakeUsersRepository();
    await signup(makeSignupInput(), { users: repository, signToken });

    await expect(
      login(makeLoginInput({ password: 'wrong password' }), { users: repository, signToken }),
    ).rejects.toEqual({ code: INVALID_CREDENTIALS });
  });

  it('throws the identical INVALID_CREDENTIALS for an unknown email', async () => {
    const { repository } = createFakeUsersRepository();

    await expect(
      login(makeLoginInput({ email: 'unknown@example.com' }), { users: repository, signToken }),
    ).rejects.toEqual({ code: INVALID_CREDENTIALS });
  });

  it('does comparable work on both failure paths by verifying a dummy hash on unknown email', async () => {
    const { repository } = createFakeUsersRepository();
    verifyMock.mockClear();

    try {
      await login(makeLoginInput({ email: 'unknown@example.com' }), {
        users: repository,
        signToken,
      });
    } catch {
      /* expected */
    }

    const unknownEmailCalls = verifyMock.mock.calls.filter(
      ([hash]) => typeof hash === 'string' && hash.includes('argon2id'),
    );
    expect(unknownEmailCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('auth service — token issuance', () => {
  it('issues a JWT whose payload is exactly {sub, iat, exp}', async () => {
    const { repository } = createFakeUsersRepository();
    const { user, token } = await signup(makeSignupInput(), { users: repository, signToken });

    const payload = decodeToken(token) as Record<string, unknown>;

    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub']);
    expect(payload.sub).toBe(user.id);
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
  });
});
