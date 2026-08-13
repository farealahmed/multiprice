import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch } from './client';
import { addLine, create, get, list, remove, removeLine, update, updateLine } from './documents';

vi.mock('./client', () => ({
  ApiError: class ApiError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  apiFetch: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);

describe('documents API client', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue([]);
  });

  it('gets the documents collection', async () => {
    await expect(list()).resolves.toEqual([]);

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/documents');
  });

  it('gets a document by id', async () => {
    await expect(get('document-1')).resolves.toEqual([]);

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/documents/document-1');
  });

  it('posts a document create input', async () => {
    const input = {
      title: 'July invoice',
      customer: 'Acme Corp',
      issueDate: '2026-07-31',
    };

    await expect(create(input)).resolves.toEqual([]);

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('patches a document update input', async () => {
    const patch = { title: 'Updated invoice' };

    await expect(update('document-1', patch)).resolves.toEqual([]);

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/documents/document-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  });

  it('deletes a document by id', async () => {
    await expect(remove('document-1')).resolves.toBeUndefined();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/documents/document-1', {
      method: 'DELETE',
    });
  });

  it('posts a line to a document', async () => {
    const input = {
      description: 'Consulting',
      quantity: 2,
      unitPrice: 150,
      discount: { type: 'none' as const },
      taxPercent: 10,
    };

    await expect(addLine('document-1', input)).resolves.toEqual([]);

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/documents/document-1/lines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('patches a document line', async () => {
    const input = {
      description: 'Updated consulting',
      quantity: 2,
      unitPrice: 150,
      discount: { type: 'none' as const },
      taxPercent: 10,
    };

    await expect(updateLine('document-1', 'line-1', input)).resolves.toEqual([]);

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/documents/document-1/lines/line-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('deletes a document line', async () => {
    await expect(removeLine('document-1', 'line-1')).resolves.toBeUndefined();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/documents/document-1/lines/line-1', {
      method: 'DELETE',
    });
  });

  it('propagates ApiError unchanged', async () => {
    const error = new ApiError('DOCUMENT_NOT_FOUND', 'Document not found.');
    apiFetchMock.mockRejectedValueOnce(error);

    await expect(get('missing-document')).rejects.toBe(error);
  });
});
