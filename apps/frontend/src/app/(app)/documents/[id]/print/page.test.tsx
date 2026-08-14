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

const paramsMock = vi.fn(() => ({ id: 'document-1' }));

vi.mock('next/navigation', () => ({
  useParams: () => paramsMock(),
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

const documentB: DocumentResponse = {
  ...document,
  id: 'document-2',
  title: 'Office lease renewal',
  lines: [
    {
      id: 'line-2',
      description: 'Consulting',
      quantity: 1,
      unitPrice: 500,
      discount: { type: 'none' },
      taxPercent: 0,
    },
  ],
};

/** Deferred promise — lets a test resolve a mock's return value on its own schedule. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  paramsMock.mockReturnValue({ id: 'document-1' });
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

  it('never previews a stale document once navigation has moved to a new one', async () => {
    // Simulates the real hazard: preview() is a shared, debounced singleton
    // (lib/api/pricing.ts) that resolves every in-flight caller with whichever
    // lines were requested last, regardless of which document asked. A's own
    // get() resolving late must not be allowed to call preview() at all once
    // the user has already navigated to B — otherwise A's late preview() call
    // would corrupt the shared debouncer and B could render A's totals.
    const getA = deferred<DocumentResponse>();
    getMock.mockImplementationOnce(() => getA.promise);

    const { rerender } = render(<PrintDocumentPage />);
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('document-1'));

    // Navigate to document B before A's get() has resolved.
    paramsMock.mockReturnValue({ id: 'document-2' });
    getMock.mockResolvedValueOnce(documentB);
    rerender(<PrintDocumentPage />);
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('document-2'));

    // B's own request completes normally.
    await waitFor(() => expect(previewMock).toHaveBeenCalledWith([
      { quantity: 1, unitPrice: 500, discount: { type: 'none' }, taxPercent: 0 },
    ]));
    expect(await screen.findByText('Office lease renewal')).toBeTruthy();

    // A's stale get() finally resolves — this must NOT trigger a preview()
    // call for A's lines; if it did, it would poison the shared debouncer.
    getA.resolve(document);
    await new Promise((r) => setTimeout(r, 0));
    expect(previewMock).not.toHaveBeenCalledWith([
      { quantity: 2, unitPrice: 100, discount: { type: 'none' }, taxPercent: 5 },
    ]);
    expect(previewMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Office lease renewal')).toBeTruthy();
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
