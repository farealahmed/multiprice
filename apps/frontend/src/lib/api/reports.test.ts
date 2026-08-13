import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch } from './client';
import { summary, view } from './reports';

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
    apiFetchMock.mockResolvedValue({
      from: '2026-07-01',
      to: '2026-07-31',
      documentCount: 2,
      totalGrandTotal: 7426.78,
      totalTax: 274.58,
      totalDiscount: 401.8,
    });
  });

  it('calls GET /api/v1/reports/summary with from and to as query params', async () => {
    await summary('2026-07-01', '2026-07-31');

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/v1/reports/summary?from=2026-07-01&to=2026-07-31',
    );
  });

  it('calls the bare path when no range is supplied', async () => {
    await summary();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/reports/summary');
  });

  it('calls the consistent report view endpoint with the selected range', async () => {
    await view({ from: '2026-07-01', to: '2026-07-31' });

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/v1/reports/view?from=2026-07-01&to=2026-07-31',
    );
  });

  it('propagates ApiError unchanged', async () => {
    const error = new ApiError('DATE_RANGE_INVERTED', 'to must be on or after from.');
    apiFetchMock.mockRejectedValueOnce(error);

    await expect(summary('2026-07-31', '2026-07-01')).rejects.toBe(error);
  });
});
