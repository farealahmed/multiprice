import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch } from './client';
import { PREVIEW_DEBOUNCE_MS, preview } from './pricing';
import type { DocumentResult, LineInput } from './types/pricing';

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<{ apiFetch: typeof apiFetch }>();
  return { ...actual, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

const line = (overrides?: Partial<LineInput>): LineInput => ({
  quantity: 2,
  unitPrice: 10.5,
  discount: { type: 'none' },
  taxPercent: 20,
  ...overrides,
});

const documentResult = (overrides?: Partial<DocumentResult>): DocumentResult => ({
  lines: [
    {
      subtotal: 21,
      discountAmount: 0,
      afterDiscount: 21,
      taxAmount: 4.2,
      total: 25.2,
    },
  ],
  subtotal: 21,
  totalDiscount: 0,
  totalTax: 4.2,
  grandTotal: 25.2,
  ...overrides,
});

describe('preview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiFetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts the lines to the preview endpoint', async () => {
    const result = documentResult();
    apiFetchMock.mockResolvedValue(result);
    const lines = [line()];

    const pending = preview(lines);
    await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS);

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/pricing/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines }),
    });
    await expect(pending).resolves.toEqual(result);
  });

  it('debounces rapid calls into one request with the last lines', async () => {
    const result = documentResult();
    apiFetchMock.mockResolvedValue(result);

    const first = preview([line({ quantity: 1 })]);
    const second = preview([line({ quantity: 2 })]);
    const third = preview([line({ quantity: 3 })]);

    await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS - 1);
    expect(apiFetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const init = apiFetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({ lines: [line({ quantity: 3 })] });

    await expect(first).resolves.toEqual(result);
    await expect(second).resolves.toEqual(result);
    await expect(third).resolves.toEqual(result);
  });

  it('drops an out-of-order response so only the newer result is observed', async () => {
    const deferred = () => {
      let resolve!: (result: DocumentResult) => void;
      const promise = new Promise<DocumentResult>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    };
    const older = deferred();
    const newer = deferred();
    apiFetchMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

    const staleResult = documentResult({ grandTotal: 25.2 });
    const newerResult = documentResult({ grandTotal: 42 });

    const staleCall = preview([line({ quantity: 1 })]);
    await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS);
    const freshCall = preview([line({ quantity: 2 })]);
    await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS);

    expect(apiFetchMock).toHaveBeenCalledTimes(2);

    const observed: DocumentResult[] = [];
    void staleCall.then((result) => observed.push(result));
    void freshCall.then((result) => observed.push(result));

    newer.resolve(newerResult);
    await vi.advanceTimersByTimeAsync(0);
    older.resolve(staleResult);
    await vi.advanceTimersByTimeAsync(0);

    expect(observed).toEqual([newerResult]);
    await expect(freshCall).resolves.toEqual(newerResult);
  });

  it('surfaces ApiError unchanged', async () => {
    const details = [
      {
        path: 'lines.0.quantity',
        code: 'QUANTITY_TOO_LOW',
        message: 'Quantity must be at least 1.',
      },
    ];
    apiFetchMock.mockRejectedValue(
      new ApiError('VALIDATION_FAILED', 'Validation failed.', details),
    );

    const pending = preview([line({ quantity: 0 })]);
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'ApiError',
      code: 'VALIDATION_FAILED',
      message: 'Validation failed.',
      details,
    });
    await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS);
    await assertion;
  });
});
