/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { InputHTMLAttributes } from 'react';

import styles from './auth-form.module.css';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function Field({ label, error, id, ...inputProps }: FieldProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input aria-describedby={error === undefined ? undefined : `${id}-error`} aria-invalid={error !== undefined} id={id} {...inputProps} />
      {error === undefined ? null : (
        <p className={styles.fieldError} id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
