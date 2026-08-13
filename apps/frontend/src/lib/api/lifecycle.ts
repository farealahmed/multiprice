import { apiFetch } from './client';
import type { DocumentResponse } from './types/document';

export function finalize(id: string): Promise<DocumentResponse> {
  return apiFetch<DocumentResponse>(`/api/v1/documents/${id}/finalize`, { method: 'POST' });
}

export function duplicate(id: string): Promise<DocumentResponse> {
  return apiFetch<DocumentResponse>(`/api/v1/documents/${id}/duplicate`, { method: 'POST' });
}
