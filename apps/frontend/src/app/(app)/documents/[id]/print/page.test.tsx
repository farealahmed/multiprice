/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/client';
import { get } from '@/lib/api/documents';
import { preview } from '@/lib/api/pricing';
import type { DocumentResponse } from '@/lib/api/types/document';
import type { DocumentResult } from '@/lib/api/types/pricing';

import PrintDocumentPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'document-1' }),
}));

vi.mock('@/components/shell/Topbar', () => ({
  Topbar: () => null,
}));

vi.mock('@/lib/api/documents', () => ({
  get: vi.fn(),
}));

vi.mock('@/lib/api/pricing', () => ({
  preview: vi.fn(),
}));

const getMock = vi.mocked(get);
const previewMock = vi.mocked(preview);

const document: DocumentResponse = {
  id: 'document-1',
  title: 'Website redesign',
  customer: 'Acme Corp',
  issueDate: '2026-08-13',
  status: 'draft',
  lines: [
    {
      id: 'line-1',
      description: 'Design work',
      quantity: 2,
      unitPrice: 100,
      discount: { type: 'none' },
      taxPercent: 5,
    },
  ],
  totals: { subtotal: 200, totalDiscount: 0, totalTax: 10, grandTotal: 210 },
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
};

const result: DocumentResult = {
  lines: [{ subtotal: 200, discountAmount: 0, afterDiscount: 200, taxAmount: 10, total: 210 }],
  subtotal: 200,
  totalDiscount: 0,
  totalTax: 10,
  grandTotal: 210,
};

beforeEach(() => {
  getMock.mockResolvedValue(document);
  previewMock.mockResolvedValue(result);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PrintDocumentPage', () => {
  it('loads a draft document and its server-computed line totals', async () => {
    render(<PrintDocumentPage />);

    expect(screen.getByRole('status').textContent).toBe('Loading document…');
    expect(await screen.findByText('Website redesign')).toBeTruthy();
    expect(screen.getByText('draft')).toBeTruthy();
    expect(getMock).toHaveBeenCalledWith('document-1');
    expect(previewMock).toHaveBeenCalledWith([
      { quantity: 2, unitPrice: 100, discount: { type: 'none' }, taxPercent: 5 },
    ]);
  });

  it('shows an error and retries after the document request fails', async () => {
    getMock.mockRejectedValueOnce(new ApiError('DOCUMENT_NOT_FOUND', 'Document was not found.'));
    render(<PrintDocumentPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Document was not found.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Website redesign')).toBeTruthy();
  });
});
