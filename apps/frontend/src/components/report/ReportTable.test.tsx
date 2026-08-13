/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { formatMoney } from '@/components/money/format-money';
import type { DocumentSummary } from '@/lib/api/types/document';

import { ReportTable } from './ReportTable';

const docs: DocumentSummary[] = [
  {
    id: 'doc-1',
    title: 'Consulting Retainer — Q3',
    customer: 'Brightpath LLC',
    issueDate: '2026-07-15',
    status: 'finalized',
    totals: {
      subtotal: 5400,
      totalDiscount: 300,
      totalTax: 120,
      grandTotal: 5220,
    },
  },
  {
    id: 'doc-2',
    title: 'Office Furniture Quote',
    customer: 'Northwind Traders',
    issueDate: '2026-07-28',
    status: 'finalized',
    totals: {
      subtotal: 2154,
      totalDiscount: 101.8,
      totalTax: 154.58,
      grandTotal: 2206.78,
    },
  },
];

describe('ReportTable', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders one row per document with the money columns verbatim', () => {
    render(<ReportTable docs={docs} />);

    expect(screen.getByText('Consulting Retainer — Q3')).toBeTruthy();
    expect(screen.getByText('Office Furniture Quote')).toBeTruthy();

    for (const doc of docs) {
      expect(screen.getByText(formatMoney(doc.totals.subtotal))).toBeTruthy();
      expect(screen.getByText(formatMoney(doc.totals.totalDiscount))).toBeTruthy();
      expect(screen.getByText(formatMoney(doc.totals.totalTax))).toBeTruthy();
      expect(screen.getByText(formatMoney(doc.totals.grandTotal))).toBeTruthy();
    }
  });

  it('renders status pills and no row actions', () => {
    render(<ReportTable docs={docs} />);

    expect(screen.getAllByText('Finalized')).toHaveLength(2);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/Edit/i)).toBeNull();
    expect(screen.queryByText(/Delete/i)).toBeNull();
  });
});
