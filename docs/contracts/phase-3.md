# Phase 3 — Documents, Line Items, and Validation

This document freezes the wire representation for the documents domain, added
in this phase. It is the source later phases' README is written from. See
`docs/contracts/phase-0.md` for the cross-cutting decisions (error envelope,
mirroring rule, conventions) this phase reuses unchanged.

## 1. Document endpoints

| Method | Path | Auth | Purpose |
|----|----|----|----|
| `GET` | `/api/v1/documents` | session | Owner-scoped list, newest first, `lines` omitted |
| `POST` | `/api/v1/documents` | session | Create a document (metadata + optional lines) |
| `GET` | `/api/v1/documents/:id` | session | Read a full document including lines |
| `PATCH` | `/api/v1/documents/:id` | session | Partial metadata update, optional whole-lines replace |
| `DELETE` | `/api/v1/documents/:id` | session | Hard delete |
| `POST` | `/api/v1/documents/:id/lines` | session | Append one line |
| `PATCH` | `/api/v1/documents/:id/lines/:lineId` | session | Update one line |
| `DELETE` | `/api/v1/documents/:id/lines/:lineId` | session | Remove one line |

All endpoints are same-origin; the frontend client calls relative
`/api/v1/documents/...` URLs and the session cookie is sent automatically.

### 1.1 `GET /api/v1/documents`

**Response (200):** `DocumentSummary[]` — newest first by `issueDate`, then
`createdAt`. Only the owner sees their own documents; an owner with no
documents receives an empty array.

### 1.2 `POST /api/v1/documents`

**Request body:** `CreateDocumentInput`

**Response (201):** `DocumentResponse`

**Response (400):** the standard `ErrorEnvelope` with `details[].code` set to one
of this domain's validation codes or a Phase 1 per-line code.

`status` and `totals` are rejected with `SERVER_MANAGED_FIELD` if present.

### 1.3 `GET /api/v1/documents/:id`

**Response (200):** `DocumentResponse`

**Response (404):** the standard `ErrorEnvelope` with `code: 'DOCUMENT_NOT_FOUND'`.
Another owner's document id also yields 404, never 403.

### 1.4 `PATCH /api/v1/documents/:id`

**Request body:** `UpdateDocumentInput` — partial metadata and, optionally, the
whole `lines` array. Line ids echoed by the client are preserved; missing ids
are minted server-side.

**Response (200):** `DocumentResponse`

**Response (400/404):** as above.

`status` and `totals` are rejected with `SERVER_MANAGED_FIELD` if present.

### 1.5 `DELETE /api/v1/documents/:id`

**Response (204):** No content.

**Response (404):** `DOCUMENT_NOT_FOUND`.

### 1.6 `POST /api/v1/documents/:id/lines`

**Request body:** `LineItemInput`

**Response (200):** `DocumentResponse`

**Response (400/404):** as above.

### 1.7 `PATCH /api/v1/documents/:id/lines/:lineId`

**Request body:** `LineItemInput` (partial or full — this phase treats PATCH on
a line as a partial update over the line's fields).

**Response (200):** `DocumentResponse`

**Response (404):** `DOCUMENT_NOT_FOUND` if the document is missing or not owned;
`LINE_NOT_FOUND` if the document exists but the line id does not.

### 1.8 `DELETE /api/v1/documents/:id/lines/:lineId`

**Response (200):** `DocumentResponse`

**Response (404):** `DOCUMENT_NOT_FOUND` or `LINE_NOT_FOUND`.

## 2. `CreateDocumentInput`

```ts
type CreateDocumentInput = {
  title: string;       // 1..200 characters
  customer: string;    // 1..200 characters
  issueDate: string;   // YYYY-MM-DD
  lines?: LineItemInput[]; // defaults to []
};
```

| Field | Type | Constraint | Rejection code |
|----|----|----|----|
| `title` | `string` | non-empty after trim, ≤ 200 | `TITLE_REQUIRED` |
| `customer` | `string` | non-empty after trim, ≤ 200 | `CUSTOMER_REQUIRED` |
| `issueDate` | `string` | matches `YYYY-MM-DD` | `ISSUE_DATE_INVALID` |
| `lines` | `LineItemInput[]` | optional; each line validated by intersection with `LineInput` | per-line codes |

## 3. `UpdateDocumentInput`

Same fields as `CreateDocumentInput`, but every top-level field is optional.
If `lines` is provided, it replaces the entire array; line ids are preserved
where echoed and minted where absent.

## 4. `LineItemInput`

```ts
type LineItemInput = {
  id?: string;          // echoed back when updating existing lines
  description: string;  // 1..200 characters
  quantity: number;     // see `LineInput` bounds
  unitPrice: number;    // see `LineInput` bounds
  discount:
    | { type: 'none' }
    | { type: 'percent'; value: number }
    | { type: 'fixed'; value: number };
  taxPercent: number | null;
};
```

The numeric fields reuse Phase 1's `LineInput` schema through a `z.intersection`,
so the same bounds, precision rules, and error codes apply unchanged.

| Field | Constraint | Rejection code |
|----|----|----|
| `description` | non-empty after trim, ≤ 200 | `DESCRIPTION_REQUIRED` |
| `quantity` | ≥ 0.001, ≤ 1_000_000, ≤ 3 decimal places | `QUANTITY_TOO_LOW`, `QUANTITY_TOO_LARGE`, `QUANTITY_PRECISION` |
| `unitPrice` | ≥ 0, ≤ 1_000_000, ≤ 2 decimal places | `UNIT_PRICE_NEGATIVE`, `UNIT_PRICE_TOO_LARGE`, `MONEY_PRECISION` |
| `discount` | valid discriminated-union member | `DISCOUNT_PERCENT_OUT_OF_RANGE`, `FIXED_DISCOUNT_NEGATIVE` |
| `taxPercent` | null or 0..100 | `TAX_PERCENT_OUT_OF_RANGE` |

Engine-level rejections such as `DISCOUNT_EXCEEDS_SUBTOTAL` are raised during
`calculateDocument`, not at the schema boundary.

## 5. `DocumentResponse`

```ts
type DocumentResponse = {
  id: string;
  title: string;
  customer: string;
  issueDate: string;
  status: 'draft' | 'finalized';
  lines: LineItemResponse[];
  totals: DocumentTotals;
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
};
```

`ownerId` is never serialized. Per-line computed values are intentionally absent
from `LineItemResponse`; the editor always derives them from `/pricing/preview`.

## 6. `LineItemResponse`

```ts
type LineItemResponse = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount:
    | { type: 'none' }
    | { type: 'percent'; value: number }
    | { type: 'fixed'; value: number };
  taxPercent: number | null;
};
```

Numbers are in major units (e.g. dollars, whole percentages), not the integer
scale used for storage.

## 7. `DocumentTotals`

```ts
type DocumentTotals = {
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
};
```

All values in major units. The stored totals are in integer cents and converted
for the wire response.

## 8. `DocumentSummary`

Identical to `DocumentResponse` with `lines` omitted. Returned by `GET
/api/v1/documents`.

## 9. Error codes

Defined in `apps/backend/src/contracts/document.ts`:

| Code | Meaning |
|----|----|
| `DOCUMENT_NOT_FOUND` | Document id does not exist or is not owned by the caller |
| `TITLE_REQUIRED` | `title` is missing or empty |
| `CUSTOMER_REQUIRED` | `customer` is missing or empty |
| `ISSUE_DATE_INVALID` | `issueDate` is not `YYYY-MM-DD` |
| `LINE_NOT_FOUND` | Line id does not exist on the specified document |
| `DESCRIPTION_REQUIRED` | Line `description` is missing or empty |
| `SERVER_MANAGED_FIELD` | `status` or `totals` was sent by the client |

Phase 1's per-line codes (`QUANTITY_TOO_LOW`, `UNIT_PRICE_NEGATIVE`, etc.) are
also valid on this domain's endpoints because `LineItemInput` reuses the same
`lineInputSchema`.

## 10. 404-not-403 rule

For every id-scoped route, another owner's document id returns **404
DOCUMENT_NOT_FOUND**, never 403. Authorization is enforced by the `ownerId`
filter in the repository, not by a separate permission check after the lookup.

## 11. Mirroring

The frontend mirror lives at `apps/frontend/src/lib/api/types/document.ts`, per
Phase 0 §6's mirroring rule — hand-written, no code generation, kept in sync by
hand and guarded by the route's own response validation plus compile-time
type-checking against the mirror.
