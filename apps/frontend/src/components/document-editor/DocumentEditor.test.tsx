/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnchorHTMLAttributes, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { get, update } from '@/lib/api/documents';
import { preview } from '@/lib/api/pricing';
import type { DocumentResponse } from '@/lib/api/types/document';
import type { DocumentResult } from '@/lib/api/types/pricing';

import { DocumentEditor } from './DocumentEditor';

vi.mock('@/lib/api/documents', () => ({
  get: vi.fn(),
  update: vi.fn(),
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
});
