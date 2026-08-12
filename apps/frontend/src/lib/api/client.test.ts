import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch } from './client';

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves with parsed JSON on a successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch<{ status: string }>('/api/health')).resolves.toEqual({
      status: 'ok',
    });
  });

  it('preserves the error envelope code and details', async () => {
    const details = [{ path: 'qty', code: 'too_small', message: 'Required' }];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Validation failed.',
              details,
            },
          }),
          { status: 400 },
        ),
      ),
    );

    await expect(apiFetch('/api/health')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'VALIDATION_FAILED',
      message: 'Validation failed.',
      details,
    });
  });

  it('falls back to INTERNAL_ERROR for a non-envelope response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Service unavailable', { status: 503 })),
    );

    await expect(apiFetch('/api/health')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'INTERNAL_ERROR',
    });
  });

  it('always sends credentials and preserves relative URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/health', { credentials: 'omit' });

    expect(fetchMock).toHaveBeenCalledWith('/api/health', {
      credentials: 'include',
    });
  });

  it('exports a typed API error', () => {
    const error = new ApiError('VALIDATION_FAILED', 'Validation failed.');

    expect(error).toBeInstanceOf(Error);
  });
});
