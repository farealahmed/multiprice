'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { useSession } from './session-context';

const SIGN_IN_PATH = '/sign-in';
const RETURN_TO_PARAM = 'returnTo';

export function AuthGuard({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const attemptedPath = search.length === 0 ? pathname : `${pathname}?${search}`;

  useEffect(() => {
    if (status === 'signed-out') {
      router.replace(`${SIGN_IN_PATH}?${RETURN_TO_PARAM}=${encodeURIComponent(attemptedPath)}`);
    }
  }, [attemptedPath, router, status]);

  if (status !== 'authenticated') {
    return null;
  }

  return children;
}
