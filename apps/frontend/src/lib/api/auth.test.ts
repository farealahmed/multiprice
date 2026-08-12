import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch } from './client';
import { login, logout, me, signup } from './auth';
import type { SessionUser } from './types/auth';

vi.mock('./client', () => ({
  ApiError: class ApiError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  apiFetch: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);

const sessionUser: SessionUser = {
  id: 'user-1',
  email: 'test@example.com',
  createdAt: '2026-08-13T00:00:00.000Z',
};

describe('auth API client', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(sessionUser);
  });

  it('posts signup credentials to the signup endpoint', async () => {
    await expect(signup({ email: 'test@example.com', password: 'password-123' })).resolves.toBe(
      sessionUser,
    );

    expect(apiFetchMock).toHaveBeenCalledWith('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password-123' }),
    });
  });

  it('posts login credentials to the login endpoint', async () => {
    await login({ email: 'test@example.com', password: 'password-123' });

    expect(apiFetchMock).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password-123' }),
    });
  });

  it('posts to the logout endpoint', async () => {
    await logout();

    expect(apiFetchMock).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
  });

  it('gets the current session from the me endpoint', async () => {
    await expect(me()).resolves.toBe(sessionUser);

    expect(apiFetchMock).toHaveBeenCalledWith('/auth/me');
  });

  it('preserves typed API errors for form-level handling', async () => {
    const error = new ApiError('EMAIL_TAKEN', 'Email is already registered.');
    apiFetchMock.mockRejectedValueOnce(error);

    await expect(signup({ email: 'test@example.com', password: 'password-123' })).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
    });
  });
});
