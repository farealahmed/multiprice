/** @jsxRuntime automatic */
/** @jsxImportSource react */
import Link from 'next/link';

import { AuthForm } from '@/components/forms/AuthForm';

import styles from '../auth.module.css';

export default function CreateAccountPage() {
  return (
    <section className={styles.card}>
      <nav aria-label="Authentication" className={styles.tabs}>
        <Link className={styles.tab} href="/sign-in">
          Sign in
        </Link>
        <Link aria-current="page" className={`${styles.tab} ${styles.tabActive}`} href="/create-account">
          Create account
        </Link>
      </nav>
      <AuthForm mode="create-account" />
      <p className={styles.note}>Create an account to keep your documents private to your workspace.</p>
    </section>
  );
}
