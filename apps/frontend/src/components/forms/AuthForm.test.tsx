import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session-context';
import { UserSlot } from '@/components/shell/UserSlot';

import { login, signup } from '../../lib/api/auth';
import { AuthForm } from './AuthForm';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams('returnTo=%2Feditor'),
}));

vi.mock('@/lib/api/auth', () => ({ login: vi.fn(), signup: vi.fn() }));
vi.mock('@/lib/auth/session-context', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: vi.fn(),
}));

const loginMock = vi.mocked(login);
const signupMock = vi.mocked(signup);
const useSessionMock = vi.mocked(useSession);
const sessionUser = { id: 'user-1', email: 'test@example.com', createdAt: '2026-08-13T00:00:00.000Z' };

function renderForm(mode: 'sign-in' | 'create-account') {
  return render(<AuthForm mode={mode} />);
}

describe('AuthForm', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    loginMock.mockReset();
    signupMock.mockReset();
    useSessionMock.mockReturnValue({
      status: 'signed-out',
      user: undefined,
      setAuthenticated: vi.fn(),
      signOut: vi.fn(),
    });
  });

  afterEach(cleanup);

  it('blocks a short password without calling the server', () => {
    renderForm('sign-in');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'too-short' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByText('Password must be at least 12 characters.')).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('blocks a malformed email without calling the server', () => {
    renderForm('create-account');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(signupMock).not.toHaveBeenCalled();
  });

  it('attaches EMAIL_TAKEN to the create-account email field', async () => {
    signupMock.mockRejectedValue(new ApiError('EMAIL_TAKEN', 'An account already uses this email.'));
    renderForm('create-account');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('An account already uses this email.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'false');
  });

  it('renders INVALID_CREDENTIALS as a form-level sign-in message', async () => {
    loginMock.mockRejectedValue(new ApiError('INVALID_CREDENTIALS', 'Email or password is incorrect.'));
    renderForm('sign-in');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'false');
  });
});

describe('UserSlot', () => {
  beforeEach(() => {
    replaceMock.mockReset();
  });

  afterEach(cleanup);

  it('signs out, clears the session, and redirects to sign-in', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    useSessionMock.mockReturnValue({
      status: 'authenticated',
      user: sessionUser,
      setAuthenticated: vi.fn(),
      signOut,
    });

    render(<UserSlot />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledOnce();
      expect(replaceMock).toHaveBeenCalledWith('/sign-in');
    });
  });
});
