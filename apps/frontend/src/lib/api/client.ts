export type ApiErrorDetail = {
  path: string;
  code: string;
  message: string;
};

type ApiErrorBody = {
  error?: {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
};

export class ApiError extends Error {
  readonly code: string;
  readonly details?: ApiErrorDetail[];

  constructor(code: string, message: string, details?: ApiErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: 'include' });

  if (response.ok) {
    return response.json().catch(() => {
      throw new ApiError('INTERNAL_ERROR', 'An unexpected error occurred.');
    }) as Promise<T>;
  }

  const body = (await response.json().catch(() => undefined)) as ApiErrorBody | undefined;
  const error = body?.error;
  const code = typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR';
  const message =
    typeof error?.message === 'string' ? error.message : 'An unexpected error occurred.';
  const details = Array.isArray(error?.details)
    ? (error.details as ApiErrorDetail[])
    : undefined;

  throw new ApiError(code, message, details);
}
