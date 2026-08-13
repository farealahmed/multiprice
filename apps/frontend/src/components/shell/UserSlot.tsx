/** @jsxRuntime automatic */
/** @jsxImportSource react */
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { SessionProvider, useSession } from '@/lib/auth/session-context';

import styles from './UserSlot.module.css';

function SessionControls() {
  const { status, user, signOut } = useSession();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  if (status !== 'authenticated' || user === undefined) {
    return null;
  }

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace('/sign-in');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <span className={styles.email}>{user.email}</span>
      <button
        className={styles.button}
        disabled={signingOut}
        onClick={() => void handleSignOut()}
        type="button"
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}

export function UserSlot() {
  return (
    <SessionProvider>
      <SessionControls />
    </SessionProvider>
  );
}
