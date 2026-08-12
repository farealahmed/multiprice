import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthGuard } from './guard';
import { useSession } from './session-context';

const replaceMock = vi.fn();
let pathname = '/editor';
let query = 'document=invoice-1';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(query),
}));

vi.mock('./session-context', () => ({ useSession: vi.fn() }));

const useSessionMock = vi.mocked(useSession);

function Guarded({ children }: { children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}

describe('AuthGuard', () => {
  beforeEach(() => {
    pathname = '/editor';
    query = 'document=invoice-1';
    replaceMock.mockReset();
  });

  afterEach(cleanup);

  it('redirects signed-out visitors to sign-in with the attempted path', async () => {
    useSessionMock.mockReturnValue({
      status: 'signed-out',
      user: undefined,
      setAuthenticated: vi.fn(),
      signOut: vi.fn(),
    });

    render(<Guarded>protected editor</Guarded>);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/sign-in?returnTo=%2Feditor%3Fdocument%3Dinvoice-1');
    });
    expect(screen.queryByText('protected editor')).not.toBeInTheDocument();
  });

  it('renders children for an authenticated session', () => {
    useSessionMock.mockReturnValue({
      status: 'authenticated',
      user: { id: 'user-1', email: 'test@example.com', createdAt: '2026-08-13T00:00:00.000Z' },
      setAuthenticated: vi.fn(),
      signOut: vi.fn(),
    });

    render(<Guarded>protected editor</Guarded>);

    expect(screen.getByText('protected editor')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('withholds both redirect and content while the session is pending', () => {
    useSessionMock.mockReturnValue({
      status: 'pending',
      user: undefined,
      setAuthenticated: vi.fn(),
      signOut: vi.fn(),
    });

    render(<Guarded>protected editor</Guarded>);

    expect(screen.queryByText('protected editor')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
