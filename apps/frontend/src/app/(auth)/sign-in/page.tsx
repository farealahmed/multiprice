/** @jsxRuntime automatic */
/** @jsxImportSource react */
import Link from 'next/link';

import { AuthForm } from '@/components/forms/AuthForm';

import styles from '../auth.module.css';

export default function SignInPage() {
  return (
    <section className={styles.card}>
      <nav aria-label="Authentication" className={styles.tabs}>
        <Link aria-current="page" className={`${styles.tab} ${styles.tabActive}`} href="/sign-in">
          Sign in
        </Link>
        <Link className={styles.tab} href="/create-account">
          Create account
        </Link>
      </nav>
      <AuthForm mode="sign-in" />
      <p className={styles.note}>Sign in to work with the documents that belong to your account.</p>
    </section>
  );
}
