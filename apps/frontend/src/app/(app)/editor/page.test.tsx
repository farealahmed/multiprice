/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/client';
import { preview } from '@/lib/api/pricing';
import type { DocumentResult } from '@/lib/api/types/pricing';

import EditorPage from './page';

vi.mock('@/lib/api/pricing', () => ({
  PREVIEW_DEBOUNCE_MS: 300,
  preview: vi.fn(),
}));

// The shell components are Phase-0 files without the vitest JSX pragma (shell
// is join-owned, see specs/lanes/T5.md); the editor's seams don't involve them.
vi.mock('@/components/shell/Topbar', () => ({
  Topbar: () => null,
}));

const previewMock = vi.mocked(preview);

/** The PDF's worked 3-line example (mirrors apps/backend/test/fixtures/pdf-sample.ts). */
const sampleResult: DocumentResult = {
  lines: [
    { subtotal: 200, discountAmount: 20, afterDiscount: 180, taxAmount: 9, total: 189 },
    { subtotal: 50, discountAmount: 0, afterDiscount: 50, taxAmount: 2.5, total: 52.5 },
    { subtotal: 200, discountAmount: 20, afterDiscount: 180, taxAmount: 0, total: 180 },
  ],
  subtotal: 450,
  totalDiscount: 40,
  totalTax: 11.5,
  grandTotal: 421.5,
};

function fillSampleLines() {
  fireEvent.click(screen.getByRole('button', { name: '+ Add line' }));
  fireEvent.click(screen.getByRole('button', { name: '+ Add line' }));

  fireEvent.change(screen.getByLabelText('Row 1 quantity'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Row 1 unit price'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('Row 1 discount type'), { target: { value: 'percent' } });
  fireEvent.change(screen.getByLabelText('Row 1 discount value'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Row 1 tax percent'), { target: { value: '5' } });

  fireEvent.change(screen.getByLabelText('Row 2 quantity'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Row 2 unit price'), { target: { value: '50' } });
  fireEvent.change(screen.getByLabelText('Row 2 tax percent'), { target: { value: '5' } });

  fireEvent.change(screen.getByLabelText('Row 3 quantity'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Row 3 unit price'), { target: { value: '200' } });
  fireEvent.change(screen.getByLabelText('Row 3 discount type'), { target: { value: 'fixed' } });
  fireEvent.change(screen.getByLabelText('Row 3 discount value'), { target: { value: '20' } });
  fireEvent.change(screen.getByLabelText('Row 3 tax percent'), { target: { value: '0' } });
}

describe('EditorPage', () => {
  beforeEach(() => {
    previewMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the mockup columns and server-computed totals for the sample lines', async () => {
    previewMock.mockResolvedValue(sampleResult);
    render(<EditorPage />);

    for (const column of [
      'Description',
      'Qty',
      'Unit price',
      'Discount',
      'Tax %',
      'Subtotal',
      'Disc. amt',
      'Tax amt',
      'Line total',
    ]) {
      expect(screen.getByRole('columnheader', { name: column })).toBeInTheDocument();
    }
    expect(screen.getAllByText('—')).toHaveLength(8);

    fireEvent.change(screen.getByLabelText('Row 1 quantity'), { target: { value: '2' } });
    expect(previewMock).not.toHaveBeenCalled();

    fillSampleLines();

    expect(await screen.findByText('421.50')).toBeInTheDocument();
    expect(previewMock).toHaveBeenLastCalledWith([
      { quantity: 2, unitPrice: 100, discount: { type: 'percent', value: 10 }, taxPercent: 5 },
      { quantity: 1, unitPrice: 50, discount: { type: 'none' }, taxPercent: 5 },
      { quantity: 1, unitPrice: 200, discount: { type: 'fixed', value: 20 }, taxPercent: 0 },
    ]);
    // Every figure on screen came from the response — line 1 cells and document rollups.
    expect(screen.getByText('450.00')).toBeInTheDocument();
    expect(screen.getByText('40.00')).toBeInTheDocument();
    expect(screen.getByText('11.50')).toBeInTheDocument();
    expect(screen.getByText('189.00')).toBeInTheDocument();
    expect(screen.getByText('9.00')).toBeInTheDocument();
    expect(screen.getByText('52.50')).toBeInTheDocument();
  });

  it('adds and removes rows without disturbing the remaining rows', () => {
    render(<EditorPage />);

    fireEvent.click(screen.getByRole('button', { name: '+ Add line' }));
    expect(screen.getAllByRole('button', { name: /^Remove row/ })).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('Row 2 description'), { target: { value: 'Widget B' } });
    fireEvent.change(screen.getByLabelText('Row 2 quantity'), { target: { value: '7' } });

    fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));

    expect(screen.getAllByRole('button', { name: /^Remove row/ })).toHaveLength(1);
    const remaining = screen.getByLabelText('Row 1 description');
    expect(remaining).toHaveValue('Widget B');
    expect(screen.getByLabelText('Row 1 quantity')).toHaveValue(7);
  });

  it('makes both discount kinds unrepresentable and clears stale values on switch', async () => {
    previewMock.mockResolvedValue(sampleResult);
    render(<EditorPage />);

    expect(screen.queryByLabelText('Row 1 discount value')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Row 1 quantity'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Row 1 unit price'), { target: { value: '10' } });

    fireEvent.change(screen.getByLabelText('Row 1 discount type'), { target: { value: 'percent' } });
    const percentValue = screen.getByLabelText('Row 1 discount value');
    fireEvent.change(percentValue, { target: { value: '10' } });
    await screen.findByText('421.50');
    expect(previewMock).toHaveBeenLastCalledWith([
      expect.objectContaining({ discount: { type: 'percent', value: 10 } }),
    ]);

    fireEvent.change(screen.getByLabelText('Row 1 discount type'), { target: { value: 'fixed' } });
    const fixedValue = screen.getByLabelText('Row 1 discount value');
    expect(fixedValue).toHaveValue(null);
    fireEvent.change(fixedValue, { target: { value: '3' } });
    expect(previewMock).toHaveBeenLastCalledWith([
      expect.objectContaining({ discount: { type: 'fixed', value: 3 } }),
    ]);

    fireEvent.change(screen.getByLabelText('Row 1 discount type'), { target: { value: 'none' } });
    expect(screen.queryByLabelText('Row 1 discount value')).not.toBeInTheDocument();
    expect(previewMock).toHaveBeenLastCalledWith([
      expect.objectContaining({ discount: { type: 'none' } }),
    ]);
  });

  it('renders a matched path inline and an unmatched path at document level', async () => {
    previewMock.mockRejectedValue(
      new ApiError('VALIDATION_FAILED', 'Validation failed.', [
        { path: 'lines.0.quantity', code: 'QUANTITY_TOO_LOW', message: 'Quantity must be at least 1.' },
        { path: 'lines.7.taxPercent', code: 'TAX_PERCENT_OUT_OF_RANGE', message: 'Tax percent must be 0–100.' },
      ]),
    );
    render(<EditorPage />);

    fireEvent.change(screen.getByLabelText('Row 1 quantity'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Row 1 unit price'), { target: { value: '10' } });

    const inline = await screen.findByText('Quantity must be at least 1.');
    const quantityCell = screen.getByLabelText('Row 1 quantity').closest('td');
    expect(quantityCell).not.toBeNull();
    expect(within(quantityCell as HTMLElement).getByRole('alert')).toBe(inline);

    const notice = (await screen.findAllByRole('alert')).find(
      (element) => element !== inline,
    );
    expect(notice).toBeDefined();
    expect(within(notice as HTMLElement).getByText('Tax percent must be 0–100.')).toBeInTheDocument();
  });

  it('keeps the previous server totals visible and dimmed while a request is in flight', async () => {
    const first: DocumentResult = {
      lines: [{ subtotal: 200, discountAmount: 20, afterDiscount: 180, taxAmount: 9, total: 189 }],
      subtotal: 200,
      totalDiscount: 20,
      totalTax: 9,
      grandTotal: 189,
    };
    previewMock.mockResolvedValue(first);
    const { container } = render(<EditorPage />);

    fireEvent.change(screen.getByLabelText('Row 1 quantity'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Row 1 unit price'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Row 1 discount type'), { target: { value: 'percent' } });
    fireEvent.change(screen.getByLabelText('Row 1 discount value'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Row 1 tax percent'), { target: { value: '5' } });
    expect((await screen.findAllByText('189.00')).length).toBeGreaterThan(0);

    previewMock.mockReturnValue(new Promise<DocumentResult>(() => {}));
    fireEvent.change(screen.getByLabelText('Row 1 quantity'), { target: { value: '3' } });

    expect(await screen.findByText('Recalculating…')).toBeInTheDocument();
    expect(screen.getAllByText('189.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('200.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('—')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-pending="true"]').length).toBeGreaterThan(0);
  });

  it('keeps a still-relevant discount error visible across type switches', async () => {
    previewMock.mockRejectedValue(
      new ApiError('VALIDATION_FAILED', 'Validation failed.', [
        {
          path: 'lines.0.discount.value',
          code: 'DISCOUNT_PERCENT_OUT_OF_RANGE',
          message: 'Discount percent must be between 0 and 100.',
        },
      ]),
    );
    render(<EditorPage />);

    fireEvent.change(screen.getByLabelText('Row 1 quantity'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Row 1 unit price'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Row 1 discount type'), { target: { value: 'percent' } });
    fireEvent.change(screen.getByLabelText('Row 1 discount value'), { target: { value: '150' } });

    expect(await screen.findByText('Discount percent must be between 0 and 100.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Row 1 discount type'), { target: { value: 'fixed' } });
    expect(screen.getByText('Discount percent must be between 0 and 100.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Row 1 discount type'), { target: { value: 'percent' } });
    expect(screen.getByText('Discount percent must be between 0 and 100.')).toBeInTheDocument();
    expect(screen.getByLabelText('Row 1 discount value')).toHaveValue(null);
  });
});
