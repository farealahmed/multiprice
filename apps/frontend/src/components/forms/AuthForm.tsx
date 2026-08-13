/** @jsxRuntime automatic */
/** @jsxImportSource react */
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { login, signup } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session-context';

import { Field } from './Field';
import styles from './auth-form.module.css';

type AuthMode = 'sign-in' | 'create-account';

type FieldErrors = {
  email?: string;
  password?: string;
};

type AuthFormProps = {
  mode: AuthMode;
};

const copy: Record<AuthMode, { submit: string; pending: string }> = {
  'sign-in': { submit: 'Sign in', pending: 'Signing in…' },
  'create-account': { submit: 'Create account', pending: 'Creating account…' },
};

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (password.length < 12) {
    errors.password = 'Password must be at least 12 characters.';
  } else if (password.length > 128) {
    errors.password = 'Password must be 128 characters or fewer.';
  }

  return errors;
}

function destination(returnTo: string | null): string {
  return returnTo !== null && returnTo.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo
    : '/documents';
}

export function AuthForm({ mode }: AuthFormProps) {
  const { setAuthenticated } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validate(email, password);
    setFieldErrors(errors);
    setFormError(undefined);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const user = mode === 'sign-in' ? await login({ email, password }) : await signup({ email, password });
      setAuthenticated(user);
      router.replace(destination(searchParams.get('returnTo')));
    } catch (error) {
      if (error instanceof ApiError && mode === 'create-account' && error.code === 'EMAIL_TAKEN') {
        setFieldErrors({ email: error.message });
      } else if (error instanceof ApiError && mode === 'sign-in' && error.code === 'INVALID_CREDENTIALS') {
        setFormError(error.message);
      } else {
        setFormError('We could not complete that request. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} noValidate onSubmit={handleSubmit}>
      {formError === undefined ? null : (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      )}
      <Field
        autoComplete="email"
        error={fieldErrors.email}
        id={`${mode}-email`}
        label="Email"
        onChange={(event) => setEmail(event.target.value)}
        type="email"
        value={email}
      />
      <Field
        autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
        error={fieldErrors.password}
        id={`${mode}-password`}
        label="Password"
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        value={password}
      />
      <button className={styles.submit} disabled={submitting} type="submit">
        {submitting ? copy[mode].pending : copy[mode].submit} <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
