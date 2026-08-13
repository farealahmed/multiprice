import { z } from 'zod';
import { lineInputSchema } from './pricing.ts';
import { dateRangeQuerySchema } from './report.ts';

/**
 * Document contract — schemas and error codes for `/api/v1/documents` and its
 * nested `/lines` routes.
 *
 * Validation failures that correspond to this domain's error codes are raised
 * through zod's `superRefine`/`ctx.addIssue({ code: 'custom', params: { code } })`
 * so the existing envelope mapper can surface a SCREAMING_SNAKE domain code.
 */

export const DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND' as const;
export const TITLE_REQUIRED = 'TITLE_REQUIRED' as const;
export const CUSTOMER_REQUIRED = 'CUSTOMER_REQUIRED' as const;
export const ISSUE_DATE_INVALID = 'ISSUE_DATE_INVALID' as const;
export const LINE_NOT_FOUND = 'LINE_NOT_FOUND' as const;
export const DESCRIPTION_REQUIRED = 'DESCRIPTION_REQUIRED' as const;
export const SERVER_MANAGED_FIELD = 'SERVER_MANAGED_FIELD' as const;

export type DocumentErrorCode =
  | typeof DOCUMENT_NOT_FOUND
  | typeof TITLE_REQUIRED
  | typeof CUSTOMER_REQUIRED
  | typeof ISSUE_DATE_INVALID
  | typeof LINE_NOT_FOUND
  | typeof DESCRIPTION_REQUIRED
  | typeof SERVER_MANAGED_FIELD;

const MAX_TITLE_LENGTH = 200;
const MAX_CUSTOMER_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 200;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const titleField = z.preprocess(
  (val) => (typeof val === 'string' ? val : ''),
  z.string().max(MAX_TITLE_LENGTH).superRefine((value, ctx) => {
    if (value.trim().length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        params: { code: TITLE_REQUIRED },
        message: 'Title is required',
      });
    }
  }),
);

const customerField = z.preprocess(
  (val) => (typeof val === 'string' ? val : ''),
  z.string().max(MAX_CUSTOMER_LENGTH).superRefine((value, ctx) => {
    if (value.trim().length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        params: { code: CUSTOMER_REQUIRED },
        message: 'Customer is required',
      });
    }
  }),
);

const issueDateField = z.string().superRefine((value, ctx) => {
  if (!DATE_REGEX.test(value)) {
    ctx.addIssue({
      code: 'custom',
      path: [],
      params: { code: ISSUE_DATE_INVALID },
      message: 'issueDate must be YYYY-MM-DD',
    });
  }
});

const descriptionField = z.preprocess(
  (val) => (typeof val === 'string' ? val : ''),
  z.string().max(MAX_DESCRIPTION_LENGTH).superRefine((value, ctx) => {
    if (value.trim().length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        params: { code: DESCRIPTION_REQUIRED },
        message: 'Description is required',
      });
    }
  }),
);

/**
 * Line item as it arrives from the client.
 *
 * Reuses Phase 1's `lineInputSchema` via `z.intersection` so the numeric
 * validation (bounds, precision, ranges) cannot drift between the stateless
 * preview endpoint and persisted documents.
 */
export const lineItemInputSchema = z.intersection(
  lineInputSchema,
  z.object({
    id: z.string().optional(),
    description: descriptionField,
  }),
);

export type LineItemInput = z.infer<typeof lineItemInputSchema>;

/**
 * Partial line item update used by `PATCH /documents/:id/lines/:lineId`.
 *
 * Every field is optional; the route merges the payload with the existing line
 * and validates the result through `lineItemInputSchema`, so the numeric bounds
 * and ranges are enforced by the same schema object used on create.
 */
const updateLineItemDiscountSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('percent'), value: z.number() }),
  z.object({ type: z.literal('fixed'), value: z.number() }),
]);

export const updateLineItemSchema = z.object({
  id: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  discount: updateLineItemDiscountSchema.optional(),
  taxPercent: z.number().nullable().optional(),
});

export type UpdateLineItemInput = z.infer<typeof updateLineItemSchema>;

const discountResponseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('percent'), value: z.number() }),
  z.object({ type: z.literal('fixed'), value: z.number() }),
]);

export const lineItemResponseSchema = z.object({
  id: z.string(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  discount: discountResponseSchema,
  taxPercent: z.number().nullable(),
});

export type LineItemResponse = z.infer<typeof lineItemResponseSchema>;

export const documentTotalsSchema = z.object({
  subtotal: z.number(),
  totalDiscount: z.number(),
  totalTax: z.number(),
  grandTotal: z.number(),
});

export type DocumentTotals = z.infer<typeof documentTotalsSchema>;

/**
 * Full document wire response, including embedded lines.
 *
 * Per-line computed values (subtotal, discount amount, tax amount, line total)
 * are intentionally absent: the editor always derives them from the stateless
 * `/pricing/preview` endpoint.
 */
export const documentResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  customer: z.string(),
  issueDate: z.string(),
  status: z.enum(['draft', 'finalized']),
  lines: z.array(lineItemResponseSchema),
  totals: documentTotalsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type DocumentResponse = z.infer<typeof documentResponseSchema>;

/** List payload: the same document shape with `lines` omitted. */
export const documentSummarySchema = documentResponseSchema.omit({ lines: true });

export type DocumentSummary = z.infer<typeof documentSummarySchema>;

/**
 * Optional-but-forbidden server-managed fields.
 *
 * Declaring `status`/`totals` explicitly and checking for their presence in a
 * `superRefine` rejects them on input instead of silently stripping them.
 */
const serverManagedFields = z
  .object({
    status: z.any().optional(),
    totals: z.any().optional(),
  })
  .superRefine((value, ctx) => {
    if ('status' in value) {
      ctx.addIssue({
        code: 'custom',
        path: ['status'],
        params: { code: SERVER_MANAGED_FIELD },
        message: 'status is server-managed',
      });
    }
    if ('totals' in value) {
      ctx.addIssue({
        code: 'custom',
        path: ['totals'],
        params: { code: SERVER_MANAGED_FIELD },
        message: 'totals is server-managed',
      });
    }
  });

export const createDocumentSchema = z.intersection(
  z.object({
    title: titleField,
    customer: customerField,
    issueDate: issueDateField,
    lines: z.array(lineItemInputSchema).default([]),
  }),
  serverManagedFields,
);

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const updateDocumentSchema = z.intersection(
  z.object({
    title: titleField.optional(),
    customer: customerField.optional(),
    issueDate: issueDateField.optional(),
    lines: z.array(lineItemInputSchema).optional(),
  }),
  serverManagedFields,
);

export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

/**
 * Optional inclusive date range for `GET /api/v1/documents`.
 *
 * Reuses `contracts/report.ts`'s `dateRangeQuerySchema` so the list route and the
 * report route can never drift on what "in range" means.
 */
export const documentListQuerySchema = dateRangeQuerySchema;

export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;

/**
 * Every `DocumentErrorCode` member, listed once more as a value array. The
 * `satisfies` clause makes this array's element type exactly
 * `DocumentErrorCode` — if a member is ever added to or removed from the type
 * above without updating this array, the assignment below stops type-checking.
 */
export const DOCUMENT_ERROR_CODES = [
  DOCUMENT_NOT_FOUND,
  TITLE_REQUIRED,
  CUSTOMER_REQUIRED,
  ISSUE_DATE_INVALID,
  LINE_NOT_FOUND,
  DESCRIPTION_REQUIRED,
  SERVER_MANAGED_FIELD,
] as const satisfies readonly DocumentErrorCode[];

type MissingFromList = Exclude<DocumentErrorCode, (typeof DOCUMENT_ERROR_CODES)[number]>;
// If this line fails to compile, a DocumentErrorCode member exists that isn't
// listed in DOCUMENT_ERROR_CODES above — add it there too.
const _allCodesListed: MissingFromList extends never ? true : never = true;
void _allCodesListed;
