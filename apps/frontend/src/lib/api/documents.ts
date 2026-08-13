import { apiFetch } from './client';
import type {
  CreateDocumentInput,
  DocumentResponse,
  DocumentSummary,
  LineItemInput,
  UpdateDocumentInput,
} from './types/document';

type DocumentRequestInput = CreateDocumentInput | LineItemInput | UpdateDocumentInput;

const jsonRequest = (input: DocumentRequestInput, method: 'POST' | 'PATCH'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(input),
});

export function list(): Promise<DocumentSummary[]> {
  return apiFetch<DocumentSummary[]>('/api/v1/documents');
}

export function get(id: string): Promise<DocumentResponse> {
  return apiFetch<DocumentResponse>(`/api/v1/documents/${id}`);
}

export function create(input: CreateDocumentInput): Promise<DocumentResponse> {
  return apiFetch<DocumentResponse>('/api/v1/documents', jsonRequest(input, 'POST'));
}

export function update(id: string, patch: UpdateDocumentInput): Promise<DocumentResponse> {
  return apiFetch<DocumentResponse>(`/api/v1/documents/${id}`, jsonRequest(patch, 'PATCH'));
}

export async function remove(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/documents/${id}`, { method: 'DELETE' });
}

export function addLine(id: string, input: LineItemInput): Promise<DocumentResponse> {
  return apiFetch<DocumentResponse>(`/api/v1/documents/${id}/lines`, jsonRequest(input, 'POST'));
}

export function updateLine(
  id: string,
  lineId: string,
  input: LineItemInput,
): Promise<DocumentResponse> {
  return apiFetch<DocumentResponse>(
    `/api/v1/documents/${id}/lines/${lineId}`,
    jsonRequest(input, 'PATCH'),
  );
}

export async function removeLine(id: string, lineId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/documents/${id}/lines/${lineId}`, { method: 'DELETE' });
}
