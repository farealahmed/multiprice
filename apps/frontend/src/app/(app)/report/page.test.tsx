/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as reports from '@/lib/api/reports';
import * as documents from '@/lib/api/documents';
import { ApiError } from '@/lib/api/client';
import type { ReportSummary } from '@/lib/api/types/report';
import type { DocumentSummary } from '@/lib/api/types/document';

import ReportPage from './page';

vi.mock('@/components/shell/Topbar', () => ({
  Topbar: () => null,
}));

vi.mock('@/lib/api/reports', () => ({
  summary: vi.fn(),
}));

vi.mock('@/lib/api/documents', () => ({
  list: vi.fn(),
}));

const summaryMock = vi.mocked(reports.summary);
const listMock = vi.mocked(documents.list);

const summary: ReportSummary = {
  from: '2026-07-01',
  to: '2026-07-31',
  documentCount: 2,
  totalGrandTotal: 7426.78,
  totalTax: 274.58,
  totalDiscount: 401.8,
};

const docs: DocumentSummary[] = [
  {
    id: 'doc-1',
    title: 'Consulting Retainer — Q3',
    customer: 'Brightpath LLC',
    issueDate: '2026-07-15',
    status: 'finalized',
    totals: { subtotal: 5400, totalDiscount: 300, totalTax: 120, grandTotal: 5220 },
  },
  {
    id: 'doc-2',
    title: 'Office Furniture Quote',
    customer: 'Northwind Traders',
    issueDate: '2026-07-28',
    status: 'finalized',
    totals: { subtotal: 2154, totalDiscount: 101.8, totalTax: 154.58, grandTotal: 2206.78 },
  },
];

describe('ReportPage', () => {
  beforeEach(() => {
    summaryMock.mockResolvedValue(summary);
    listMock.mockResolvedValue(docs);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads the current month report on mount', async () => {
    render(<ReportPage />);

    await waitFor(() => expect(screen.getByText('Sum of grand totals')).toBeTruthy());

    expect(summaryMock).toHaveBeenCalledTimes(1);
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('renders the stat cards and table when data is present', async () => {
    render(<ReportPage />);

    await waitFor(() => expect(screen.getByText('Consulting Retainer — Q3')).toBeTruthy());

    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Documents in range')).toBeTruthy();
  });

  it('shows an empty state echoing the range when no documents match', async () => {
    summaryMock.mockResolvedValue({ ...summary, documentCount: 0, totalGrandTotal: 0, totalTax: 0, totalDiscount: 0 });
    listMock.mockResolvedValue([]);

    render(<ReportPage />);

    await waitFor(() =>
      expect(screen.getByText(/No documents issued between 2026-07-01 and 2026-07-31/i)).toBeTruthy(),
    );
  });

  it('shows an error message with a retry button when the API fails', async () => {
    summaryMock.mockRejectedValue(new ApiError('INTERNAL_ERROR', 'Server error.'));

    render(<ReportPage />);

    await waitFor(() => expect(screen.getByText('Server error.')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Try again/i })).toBeTruthy();
  });

  it('re-fires both requests when retry is clicked', async () => {
    summaryMock.mockRejectedValueOnce(new ApiError('INTERNAL_ERROR', 'Server error.'));
    summaryMock.mockResolvedValueOnce(summary);

    render(<ReportPage />);

    await waitFor(() => expect(screen.getByText('Server error.')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));

    await waitFor(() => expect(summaryMock).toHaveBeenCalledTimes(2));
    expect(listMock).toHaveBeenCalledTimes(2);
  });
});
