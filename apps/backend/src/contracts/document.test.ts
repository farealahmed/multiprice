import { describe, it, expect } from 'vitest';
import { pdfSampleLines } from '../../test/fixtures/pdf-sample.ts';
import {
  lineItemInputSchema,
  createDocumentSchema,
  updateDocumentSchema,
  documentResponseSchema,
  documentListQuerySchema,
  DOCUMENT_ERROR_CODES,
  DOCUMENT_NOT_FOUND,
  TITLE_REQUIRED,
  CUSTOMER_REQUIRED,
  ISSUE_DATE_INVALID,
  LINE_NOT_FOUND,
  DESCRIPTION_REQUIRED,
  SERVER_MANAGED_FIELD,
} from './document.ts';
import { QUANTITY_TOO_LOW } from './pricing.ts';
import { dateRangeQuerySchema, DATE_RANGE_INVERTED } from './report.ts';

function domainCode(
  result: {
    success: false;
    error: {
      issues: Array<{
        code: string;
        params?: Record<string, unknown>;
        path: (string | number)[];
      }>;
    };
  },
  path?: (string | number)[],
): string | undefined {
  const issue = result.error.issues.find((i) => {
    if (i.code !== 'custom') return false;
    if (path === undefined) return true;
    return JSON.stringify(i.path) === JSON.stringify(path);
  });
  return issue?.params?.code as string | undefined;
}

describe('document schemas — acceptance', () => {
  it('accepts a valid create input with no lines', () => {
    const input = { title: 'Quote', customer: 'Acme', issueDate: '2026-08-13' };
    const result = createDocumentSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lines).toEqual([]);
    }
  });

  it('accepts a valid create input with lines, including an echoed id', () => {
    const input = {
      title: 'Quote',
      customer: 'Acme',
      issueDate: '2026-08-13',
      lines: pdfSampleLines.map((line, index) => ({
        ...line,
        description: `Line ${index + 1}`,
        id: index === 0 ? 'echoed-id' : undefined,
      })),
    };
    const result = createDocumentSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lines).toHaveLength(pdfSampleLines.length);
      expect(result.data.lines[0]?.id).toBe('echoed-id');
      expect(result.data.lines[1]?.id).toBeUndefined();
    }
  });

  it('accepts a line with no id', () => {
    const line = {
      description: 'Service',
      quantity: 1,
      unitPrice: 100,
      discount: { type: 'none' as const },
      taxPercent: null,
    };
    const result = lineItemInputSchema.safeParse(line);
    expect(result.success).toBe(true);
  });

  it('accepts a partial update input', () => {
    const input = { title: 'Updated' };
    const result = updateDocumentSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('document schemas — document-level validation', () => {
  const validCreate = { title: 'Quote', customer: 'Acme', issueDate: '2026-08-13' };

  it('rejects a missing title', () => {
    const { title: _title, ...input } = validCreate;
    const result = createDocumentSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(domainCode(result, ['title'])).toBe(TITLE_REQUIRED);
    }
  });

  it('rejects an empty title', () => {
    const result = createDocumentSchema.safeParse({ ...validCreate, title: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(domainCode(result, ['title'])).toBe(TITLE_REQUIRED);
    }
  });

  it('rejects a missing customer', () => {
    const { customer: _customer, ...input } = validCreate;
    const result = createDocumentSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(domainCode(result, ['customer'])).toBe(CUSTOMER_REQUIRED);
    }
  });

  it('rejects an empty customer', () => {
    const result = createDocumentSchema.safeParse({ ...validCreate, customer: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(domainCode(result, ['customer'])).toBe(CUSTOMER_REQUIRED);
    }
  });

  it('rejects a malformed issueDate', () => {
    const result = createDocumentSchema.safeParse({ ...validCreate, issueDate: '08/13/2026' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(domainCode(result, ['issueDate'])).toBe(ISSUE_DATE_INVALID);
    }
  });
});

describe('document schemas — line-level validation', () => {
  it('rejects an empty line description', () => {
    const input = {
      title: 'Quote',
      customer: 'Acme',
      issueDate: '2026-08-13',
      lines: [
        {
          description: '',
          quantity: 1,
          unitPrice: 100,
          discount: { type: 'none' as const },
          taxPercent: null,
        },
      ],
    };
    const result = createDocumentSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(domainCode(result, ['lines', 0, 'description'])).toBe(DESCRIPTION_REQUIRED);
    }
  });

  it('still enforces Phase 1 per-line codes through the intersection', () => {
    const input = {
      title: 'Quote',
      customer: 'Acme',
      issueDate: '2026-08-13',
      lines: [
        {
          description: 'Service',
          quantity: 0,
          unitPrice: 100,
          discount: { type: 'none' as const },
          taxPercent: null,
        },
      ],
    };
    const result = createDocumentSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(domainCode(result, ['lines', 0, 'quantity'])).toBe(QUANTITY_TOO_LOW);
    }
  });
});

describe('document schemas — server-managed fields', () => {
  const validCreate = { title: 'Quote', customer: 'Acme', issueDate: '2026-08-13' };

  it('rejects totals on create input', () => {
    const result = createDocumentSchema.safeParse({
      ...validCreate,
      totals: { subtotal: 0, totalDiscount: 0, totalTax: 0, grandTotal: 0 },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(domainCode(result, ['totals'])).toBe(SERVER_MANAGED_FIELD);
    }
  });

  it('rejects status on create input', () => {
    const result = createDocumentSchema.safeParse({ ...validCreate, status: 'finalized' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(domainCode(result, ['status'])).toBe(SERVER_MANAGED_FIELD);
    }
  });
});

describe('document schemas — response shape', () => {
  it('DocumentResponse excludes ownerId', () => {
    const keys = Object.keys(documentResponseSchema.shape);
    expect(keys).not.toContain('ownerId');
  });
});

describe('document schemas — error code completeness', () => {
  it('lists every DocumentErrorCode in the code array', () => {
    const expected = [
      DOCUMENT_NOT_FOUND,
      TITLE_REQUIRED,
      CUSTOMER_REQUIRED,
      ISSUE_DATE_INVALID,
      LINE_NOT_FOUND,
      DESCRIPTION_REQUIRED,
      SERVER_MANAGED_FIELD,
    ];
    expect(DOCUMENT_ERROR_CODES.length).toBe(expected.length);
    for (const code of expected) {
      expect(DOCUMENT_ERROR_CODES).toContain(code);
    }
  });
});

describe('document schemas — list query reuse', () => {
  it('reuses report.ts dateRangeQuerySchema instead of redeclaring it', () => {
    expect(documentListQuerySchema).toBe(dateRangeQuerySchema);
  });

  it('produces the same inverted-range error as the report schema', () => {
    const result = documentListQuerySchema.safeParse({ from: '2026-08-01', to: '2026-07-01' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.code === 'custom');
      expect(issue?.params?.code).toBe(DATE_RANGE_INVERTED);
      expect(issue?.path).toEqual(['to']);
    }
  });
});
