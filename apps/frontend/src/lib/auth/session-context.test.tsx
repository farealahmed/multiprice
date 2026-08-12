import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/client';
import { me } from '../api/auth';
import { SessionProvider, useSession } from './session-context';
import type { SessionUser } from '../api/types/auth';

vi.mock('../api/auth', () => ({ me: vi.fn() }));

const meMock = vi.mocked(me);

const sessionUser: SessionUser = {
  id: 'user-1',
  email: 'test@example.com',
  createdAt: '2026-08-13T00:00:00.000Z',
};

function SessionState() {
  const { status, user } = useSession();
  return <output>{status}:{user?.email ?? 'none'}</output>;
}

function renderSession(children: ReactNode = <SessionState />) {
  return render(<SessionProvider>{children}</SessionProvider>);
}

describe('SessionProvider', () => {
  beforeEach(() => {
    meMock.mockReset();
  });

  afterEach(cleanup);

  it('keeps the session pending until hydration resolves', () => {
    meMock.mockResolvedValue(sessionUser);

    renderSession();

    expect(screen.getByText('pending:none')).toBeInTheDocument();
  });

  it('hydrates an authenticated user from me', async () => {
    meMock.mockResolvedValue(sessionUser);

    renderSession();

    expect(await screen.findByText('authenticated:test@example.com')).toBeInTheDocument();
  });

  it('resolves to signed-out when me reports an unauthenticated session', async () => {
    meMock.mockRejectedValue(new ApiError('UNAUTHENTICATED', 'Authentication is required.'));

    renderSession();

    await waitFor(() => {
      expect(screen.getByText('signed-out:none')).toBeInTheDocument();
    });
  });
});
