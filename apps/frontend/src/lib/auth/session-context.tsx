'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { logout, me } from '../api/auth';
import type { SessionUser } from '../api/types/auth';

export type SessionStatus = 'pending' | 'authenticated' | 'signed-out';

export type SessionContextValue = {
  status: SessionStatus;
  user: SessionUser | undefined;
  setAuthenticated: (user: SessionUser) => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('pending');
  const [user, setUser] = useState<SessionUser>();

  useEffect(() => {
    let active = true;

    void me().then(
      (sessionUser) => {
        if (!active) {
          return;
        }

        setUser(sessionUser);
        setStatus('authenticated');
      },
      () => {
        if (!active) {
          return;
        }

        setUser(undefined);
        setStatus('signed-out');
      },
    );

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      user,
      setAuthenticated: (sessionUser) => {
        setUser(sessionUser);
        setStatus('authenticated');
      },
      signOut: async () => {
        await logout();
        setUser(undefined);
        setStatus('signed-out');
      },
    }),
    [status, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const session = useContext(SessionContext);
  if (session === undefined) {
    throw new Error('useSession must be used within a SessionProvider.');
  }

  return session;
}
