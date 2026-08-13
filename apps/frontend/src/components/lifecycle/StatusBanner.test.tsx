/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StatusBanner } from './StatusBanner';

describe('StatusBanner', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders children as a non-interactive status notice', () => {
    render(
      <StatusBanner>
        <strong>Locked.</strong> This document is finalized.
      </StatusBanner>,
    );

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Locked.')).toBeTruthy();
    expect(screen.getByText('This document is finalized.')).toBeTruthy();
  });
});
