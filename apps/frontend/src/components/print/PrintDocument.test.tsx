/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { DocumentResponse } from '@/lib/api/types/document';
import type { DocumentResult } from '@/lib/api/types/pricing';

import { PrintDocument } from './PrintDocument';

const document: DocumentResponse = {
  id: 'document-abcdef',
  title: 'Office Furniture Quote',
  customer: 'Northwind Traders',
  issueDate: '2026-07-28',
  status: 'finalized',
  lines: [
    {
      id: 'line-1',
      description: 'Ergonomic chair',
      quantity: 4,
      unitPrice: 259,
      discount: { type: 'percent', value: 5 },
      taxPercent: 8,
    },
    {
      id: 'line-2',
      description: 'Standing desk',
      quantity: 2,
      unitPrice: 499,
      discount: { type: 'fixed', value: 50 },
      taxPercent: null,
    },
  ],
  totals: { subtotal: 2034, totalDiscount: 101.8, totalTax: 154.58, grandTotal: 2086.78 },
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T14:32:00.000Z',
};

const result: DocumentResult = {
  lines: [
    { subtotal: 1036, discountAmount: 51.8, afterDiscount: 984.2, taxAmount: 78.74, total: 1062.94 },
    { subtotal: 998, discountAmount: 50, afterDiscount: 948, taxAmount: 0, total: 948 },
  ],
  subtotal: 2034,
  totalDiscount: 101.8,
  totalTax: 78.74,
  grandTotal: 2060.94,
};

afterEach(cleanup);

describe('PrintDocument', () => {
  it('renders metadata and every printed line field', () => {
    render(<PrintDocument document={document} result={result} />);

    expect(screen.getByRole('heading', { name: 'D-2026-ABCDEF' })).toBeTruthy();
    expect(screen.getByText('Northwind Traders')).toBeTruthy();
    expect(screen.getByText('Office Furniture Quote')).toBeTruthy();
    expect(screen.getByText('2026-07-28')).toBeTruthy();
    expect(screen.getByText('finalized')).toBeTruthy();

    const table = screen.getByRole('table');
    const [firstLine, secondLine] = within(table).getAllByRole('row').slice(1);
    expect(firstLine?.textContent).toContain('Ergonomic chair');
    expect(firstLine?.textContent).toContain('4');
    expect(firstLine?.textContent).toContain('$259.00');
    expect(firstLine?.textContent).toContain('5 %');
    expect(firstLine?.textContent).toContain('8');
    expect(firstLine?.textContent).toContain('$1062.94');
    expect(secondLine?.textContent).toContain('Standing desk');
    expect(secondLine?.textContent).toContain('2');
    expect(secondLine?.textContent).toContain('$499.00');
    expect(secondLine?.textContent).toContain('$50.00');
    expect(secondLine?.textContent).toContain('—');
    expect(secondLine?.textContent).toContain('$948.00');
  });

  it('renders totals directly from the document response', () => {
    render(<PrintDocument document={document} result={result} />);

    const totals = screen.getByRole('region', { name: 'Document totals' });
    expect(totals.textContent).toContain('$2034.00');
    expect(totals.textContent).toContain('− $101.80');
    expect(totals.textContent).toContain('+ $154.58');
    expect(totals.textContent).toContain('$2086.78');
    expect(totals.textContent).not.toContain('$2060.94');
  });

  it('renders an empty document without rows while retaining zero totals', () => {
    render(
      <PrintDocument
        document={{ ...document, status: 'draft', lines: [], totals: { subtotal: 0, totalDiscount: 0, totalTax: 0, grandTotal: 0 } }}
        result={{ ...result, lines: [] }}
      />,
    );

    expect(screen.getByText('draft')).toBeTruthy();
    expect(within(screen.getByRole('table')).queryAllByRole('row')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Document totals' }).textContent).toContain('$0.00');
  });
});
