/** @jsxRuntime automatic */
/** @jsxImportSource react */
'use client';

import { Suspense, type ReactNode } from 'react';

import { AuthGuard } from '@/lib/auth/guard';
import { SessionProvider } from '@/lib/auth/session-context';

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <SessionProvider>
      <Suspense fallback={null}>
        <AuthGuard>{children}</AuthGuard>
      </Suspense>
    </SessionProvider>
  );
}
