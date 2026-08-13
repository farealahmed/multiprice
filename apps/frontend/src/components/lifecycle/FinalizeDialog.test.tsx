/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FinalizeDialog } from './FinalizeDialog';

vi.mock('@/components/shell/Topbar', () => ({
  Topbar: () => null,
}));

describe('FinalizeDialog', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('names the document and states finalization is irreversible', () => {
    render(
      <FinalizeDialog
        title="Office Furniture Quote"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Finalize document?')).toBeTruthy();
    expect(screen.getByText(/Office Furniture Quote/)).toBeTruthy();
    expect(screen.getByText(/irreversible/)).toBeTruthy();
  });

  it('calls onConfirm only when the confirm button is clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();

    render(
      <FinalizeDialog
        title="Quote"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Finalize' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when the cancel button is clicked and does not call onConfirm', () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();

    render(
      <FinalizeDialog
        title="Quote"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closes on Escape and leaves the cancel button focused by default', () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();

    render(
      <FinalizeDialog
        title="Quote"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders an error message when provided', () => {
    render(
      <FinalizeDialog
        title="Quote"
        error="Add at least one line before finalizing."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Add at least one line before finalizing.')).toBeTruthy();
  });
});
