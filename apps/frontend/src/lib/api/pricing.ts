import { apiFetch } from './client';
import type { DocumentResult, LineInput } from './types/pricing';

export const PREVIEW_DEBOUNCE_MS = 300;

type Waiter = {
  resolve: (result: DocumentResult) => void;
  reject: (error: unknown) => void;
};

let timer: NodeJS.Timeout | undefined;
let waiters: Waiter[] = [];
let latestLines: LineInput[] = [];
// Incremented each time a request is actually issued; a settling response whose
// sequence is no longer the latest is dropped (R9 — an older reply landing last
// must never overwrite a newer total).
let issuedRequests = 0;

export function preview(lines: LineInput[]): Promise<DocumentResult> {
  latestLines = lines;
  if (timer !== undefined) {
    clearTimeout(timer);
  }

  const result = new Promise<DocumentResult>((resolve, reject) => {
    waiters.push({ resolve, reject });
  });

  timer = setTimeout(() => {
    timer = undefined;
    const sequence = ++issuedRequests;
    const pending = waiters;
    waiters = [];
    const body = latestLines;

    apiFetch<DocumentResult>('/api/v1/pricing/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: body }),
    }).then(
      (result) => {
        if (sequence !== issuedRequests) {
          return;
        }
        for (const waiter of pending) {
          waiter.resolve(result);
        }
      },
      (error: unknown) => {
        if (sequence !== issuedRequests) {
          return;
        }
        for (const waiter of pending) {
          waiter.reject(error);
        }
      },
    );
  }, PREVIEW_DEBOUNCE_MS);

  return result;
}
