/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AnchorHTMLAttributes, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/client';
import { get, update } from '@/lib/api/documents';
import { finalize } from '@/lib/api/lifecycle';
import { preview } from '@/lib/api/pricing';
import { DOCUMENT_FINALIZED } from '@/lib/api/types/lifecycle';
import type { DocumentResponse } from '@/lib/api/types/document';
import type { DocumentResult } from '@/lib/api/types/pricing';

import { DocumentEditor } from './DocumentEditor';

vi.mock('@/lib/api/documents', () => ({
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/api/lifecycle', () => ({
  finalize: vi.fn(),
}));

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
  default: ({ children, onClick, ...props }: LinkProps) => (
    <a
      {...props}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

const getMock = vi.mocked(get);
const previewMock = vi.mocked(preview);
const updateMock = vi.mocked(update);
const finalizeMock = vi.mocked(finalize);

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

const finalizedDocument: DocumentResponse = {
  ...document,
  status: 'finalized',
  totals: { subtotal: 200, totalDiscount: 0, totalTax: 10, grandTotal: 210 },
  updatedAt: '2026-08-13T00:01:00.000Z',
};

const liveResult: DocumentResult = {
  lines: [{ subtotal: 200, discountAmount: 0, afterDiscount: 200, taxAmount: 10, total: 210 }],
  subtotal: 200,
  totalDiscount: 0,
  totalTax: 10,
  grandTotal: 210,
};

beforeEach(() => {
  getMock.mockResolvedValue(document);
  previewMock.mockResolvedValue(liveResult);
  updateMock.mockResolvedValue({ ...document, totals: { subtotal: 201, totalDiscount: 0, totalTax: 10.05, grandTotal: 211.05 } });
  finalizeMock.mockResolvedValue(finalizedDocument);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DocumentEditor', () => {
  it('loads metadata and uses the live preview for per-row figures', async () => {
    render(<DocumentEditor documentId="document-1" />);

    expect(await screen.findByDisplayValue('Website redesign')).toBeTruthy();
    expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy();
    expect(screen.getByDisplayValue('2026-08-13')).toBeTruthy();
    await waitFor(() => expect(previewMock).toHaveBeenCalledWith([{ quantity: 2, unitPrice: 100, discount: { type: 'none' }, taxPercent: 5 }]));
    await waitFor(() => expect(screen.getByText('Grand total').parentElement?.textContent).toContain('$210.00'));
  });

  it('echoes line ids and excludes server-managed fields from the save payload', async () => {
    render(<DocumentEditor documentId="document-1" />);
    await screen.findByDisplayValue('Website redesign');

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledWith('document-1', {
      title: 'Website redesign',
      customer: 'Acme Corp',
      issueDate: '2026-08-13',
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
    });
    const savedPayload = updateMock.mock.calls[0]?.[1];
    if (savedPayload === undefined) {
      throw new Error('Expected a document update payload.');
    }
    expect(savedPayload).not.toHaveProperty('status');
    expect(savedPayload).not.toHaveProperty('totals');
    await waitFor(() => expect(screen.getByText('Grand total').parentElement?.textContent).toContain('$211.05'));
  });

  it('blocks navigation while edits are unsaved and clears the guard after saving', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<DocumentEditor documentId="document-1" />);
    await screen.findByDisplayValue('Website redesign');

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Changed title' } });
    fireEvent.click(screen.getByRole('link', { name: '← Back to documents' }));
    expect(confirm).toHaveBeenCalledWith('Discard unsaved changes?');

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    confirm.mockClear();
    fireEvent.click(screen.getByRole('link', { name: '← Back to documents' }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('disables finalize while edits are unsaved, and re-enables it once saved', async () => {
    render(<DocumentEditor documentId="document-1" />);
    await screen.findByDisplayValue('Website redesign');

    const finalizeButton = screen.getByRole('button', { name: 'Finalize document' });
    expect(finalizeButton).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Changed title' } });
    expect(finalizeButton).toBeDisabled();

    // Disabled buttons don't fire click handlers in the DOM; confirm the
    // dialog never opens and finalize is never called for a dirty document.
    fireEvent.click(finalizeButton);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(finalizeMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));

    expect(finalizeButton).not.toBeDisabled();
  });

  it('opens the finalize dialog and calls finalize only on confirm', async () => {
    render(<DocumentEditor documentId="document-1" />);
    await screen.findByDisplayValue('Website redesign');

    fireEvent.click(screen.getByRole('button', { name: 'Finalize document' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText(/Website redesign/)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(finalizeMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Finalize document' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalize' }));

    await waitFor(() => expect(finalizeMock).toHaveBeenCalledWith('document-1'));
  });

  it('notifies the parent with the finalized document after a successful finalize', async () => {
    const onFinalized = vi.fn();
    render(<DocumentEditor documentId="document-1" onFinalized={onFinalized} />);
    await screen.findByDisplayValue('Website redesign');

    fireEvent.click(screen.getByRole('button', { name: 'Finalize document' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalize' }));

    await waitFor(() => expect(onFinalized).toHaveBeenCalledWith(finalizedDocument));
  });

  it('surfaces a DOCUMENT_FINALIZED save error and notifies the parent to switch to read-only', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onFinalized = vi.fn();
    updateMock.mockRejectedValue(new ApiError(DOCUMENT_FINALIZED, 'Document is finalized.'));

    render(<DocumentEditor documentId="document-1" onFinalized={onFinalized} />);
    await screen.findByDisplayValue('Website redesign');

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(screen.getByText(/finalized in another session/)).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Save draft' })).not.toBeDisabled();

    vi.advanceTimersByTime(1500);
    await waitFor(() => expect(onFinalized).toHaveBeenCalled());

    vi.useRealTimers();
  });

  it('does not call onFinalized when finalize fails', async () => {
    const onFinalized = vi.fn();
    finalizeMock.mockRejectedValue(new ApiError('DOCUMENT_HAS_NO_LINES', 'Add at least one line.'));

    render(<DocumentEditor documentId="document-1" onFinalized={onFinalized} />);
    await screen.findByDisplayValue('Website redesign');

    fireEvent.click(screen.getByRole('button', { name: 'Finalize document' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalize' }));

    await waitFor(() => expect(screen.getByText(/Add at least one line/)).toBeTruthy());
    expect(onFinalized).not.toHaveBeenCalled();
  });
});
