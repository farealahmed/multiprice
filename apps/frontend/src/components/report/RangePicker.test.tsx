/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RangePicker } from './RangePicker';

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const last = new Date(year, now.getMonth() + 1, 0);
  const from = `${year}-${month}-01`;
  const to = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  return { from, to };
}

describe('RangePicker', () => {
  afterEach(() => {
    cleanup();
  });

  it('defaults to the current calendar month', () => {
    const expected = currentMonthRange();
    render(<RangePicker onRun={vi.fn()} />);

    expect(screen.getByLabelText('From')).toHaveValue(expected.from);
    expect(screen.getByLabelText('To')).toHaveValue(expected.to);
  });

  it('blocks from > to and never calls onRun', () => {
    const onRun = vi.fn();
    render(<RangePicker onRun={onRun} />);

    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2026-07-31' },
    });
    fireEvent.change(screen.getByLabelText('To'), {
      target: { value: '2026-07-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Run report/i }));

    expect(onRun).not.toHaveBeenCalled();
    expect(screen.getByText(/From date must be on or before/i)).toBeTruthy();
  });

  it('calls onRun with the selected range when valid', () => {
    const onRun = vi.fn();
    render(<RangePicker onRun={onRun} />);

    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2026-07-01' },
    });
    fireEvent.change(screen.getByLabelText('To'), {
      target: { value: '2026-07-31' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Run report/i }));

    expect(onRun).toHaveBeenCalledWith({ from: '2026-07-01', to: '2026-07-31' });
  });
});
