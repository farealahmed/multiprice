import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch } from './client';
import { summary } from './reports';

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

describe('reports API client', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({});
  });

  it('gets the report summary with the supplied range', async () => {
    await expect(summary('2026-07-01', '2026-07-31')).resolves.toEqual({});

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/v1/reports/summary?from=2026-07-01&to=2026-07-31',
    );
  });

  it('propagates ApiError unchanged', async () => {
    const error = new ApiError('DATE_RANGE_INVALID', 'Date range is invalid.');
    apiFetchMock.mockRejectedValueOnce(error);

    await expect(summary('2026-07-01', '2026-07-31')).rejects.toBe(error);
  });
});
