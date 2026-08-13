import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch } from './client';
import { duplicate, finalize } from './lifecycle';

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

describe('lifecycle API client', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue([]);
  });

  it('posts a finalize request', async () => {
    await expect(finalize('document-1')).resolves.toEqual([]);

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/documents/document-1/finalize', {
      method: 'POST',
    });
  });

  it('posts a duplicate request', async () => {
    await expect(duplicate('document-1')).resolves.toEqual([]);

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/documents/document-1/duplicate', {
      method: 'POST',
    });
  });

  it('propagates ApiError unchanged', async () => {
    const error = new ApiError('DOCUMENT_FINALIZED', 'Document is already finalized.');
    apiFetchMock.mockRejectedValueOnce(error);

    await expect(finalize('document-1')).rejects.toBe(error);
  });
});
