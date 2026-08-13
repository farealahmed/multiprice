/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import type { AnchorHTMLAttributes, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { preview } from '@/lib/api/pricing';
import type { DocumentResponse } from '@/lib/api/types/document';
import type { DocumentResult } from '@/lib/api/types/pricing';

import { DocumentView } from './DocumentView';

vi.mock('@/lib/api/pricing', () => ({
  preview: vi.fn(),
}));

vi.mock('@/components/shell/Topbar', () => ({
  Topbar: () => null,
}));

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: string;
  onClick?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
};

vi.mock('next/link', () => ({
  default: ({ children, href }: LinkProps) => <a href={href}>{children}</a>,
}));

const previewMock = vi.mocked(preview);

const finalizedDocument: DocumentResponse = {
  id: 'document-1',
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
      taxPercent: 8,
    },
  ],
  totals: {
    subtotal: 2034,
    totalDiscount: 101.8,
    totalTax: 154.58,
    grandTotal: 2086.78,
  },
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T14:32:00.000Z',
};

const previewResult: DocumentResult = {
  lines: [
    {
      subtotal: 1036,
      discountAmount: 51.8,
      afterDiscount: 984.2,
      taxAmount: 78.74,
      total: 1062.94,
    },
    {
      subtotal: 998,
      discountAmount: 50,
      afterDiscount: 948,
      taxAmount: 75.84,
      total: 1023.84,
    },
  ],
  subtotal: 2034,
  totalDiscount: 101.8,
  totalTax: 154.58,
  grandTotal: 2086.78,
};

beforeEach(() => {
  previewMock.mockResolvedValue(previewResult);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DocumentView', () => {
  it('renders metadata as plain text, not disabled inputs', () => {
    render(<DocumentView document={finalizedDocument} />);

    // Use the metadata labels to scope the value lookups and avoid the h1 title.
    const details = screen.getByRole('region', { name: 'Details' });
    expect(within(details).getByText('Office Furniture Quote')).toBeTruthy();
    expect(within(details).getByText('Northwind Traders')).toBeTruthy();
    expect(within(details).getByText('2026-07-28')).toBeTruthy();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('requests per-line computed figures from the pricing preview', async () => {
    render(<DocumentView document={finalizedDocument} />);

    await waitFor(() =>
      expect(previewMock).toHaveBeenCalledWith([
        { quantity: 4, unitPrice: 259, discount: { type: 'percent', value: 5 }, taxPercent: 8 },
        { quantity: 2, unitPrice: 499, discount: { type: 'fixed', value: 50 }, taxPercent: 8 },
      ]),
    );
  });

  it('renders the line items table with computed columns', async () => {
    render(<DocumentView document={finalizedDocument} />);

    await waitFor(() => expect(screen.getByText('$1036.00')).toBeTruthy());
    expect(screen.getByText('$51.80')).toBeTruthy();
    expect(screen.getByText('$984.20')).toBeTruthy();
    expect(screen.getByText('$1062.94')).toBeTruthy();
  });

  it('renders document totals', () => {
    render(<DocumentView document={finalizedDocument} />);

    const totals = screen.getByText('Document totals').parentElement;
    expect(totals?.textContent).toContain('$2034.00');
    expect(totals?.textContent).toContain('− $101.80');
    expect(totals?.textContent).toContain('+ $154.58');
    expect(totals?.textContent).toContain('$2086.78');
  });
});
