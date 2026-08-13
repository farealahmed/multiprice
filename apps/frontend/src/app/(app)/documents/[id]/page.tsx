/** @jsxRuntime automatic */
/** @jsxImportSource react */
'use client';

import { useParams } from 'next/navigation';

import { DocumentEditor } from '@/components/document-editor/DocumentEditor';

export default function DocumentEditorPage() {
  const params = useParams<{ id: string }>();
  return <DocumentEditor documentId={params.id} />;
}
