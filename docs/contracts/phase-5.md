# Phase 5 — Summary Report

This document freezes the wire representation for the summary report domain, added
in this phase. It is the source later phases' README is written from. See
`docs/contracts/phase-0.md` for the cross-cutting decisions (error envelope,
mirroring rule, conventions) this phase reuses unchanged, and
`docs/contracts/phase-3.md` for the document shapes this phase reads without
changing.

## 1. Report and document-list endpoints

| Method | Path | Auth | Purpose |
|----|----|----|----|
| `GET` | `/api/v1/reports/summary?from=&to=` | session | Aggregate report over an `issueDate` range |
| `GET` | `/api/v1/documents?from=&to=` | session | List the caller's documents, optionally scoped to the same `issueDate` range |

All endpoints are same-origin; the frontend client calls relative `/api/v1/...`
URLs and the session cookie is sent automatically.

### 1.1 `GET /api/v1/reports/summary?from=&to=`

**Query parameters:** both `from` and `to` are optional and independent. When
present, each must be a calendar date in `YYYY-MM-DD` format. If both are
present, `from` must be less than or equal to `to`.

**Response (200):**

```ts
{
  from: string;            // echoed from the validated query
  to: string;              // echoed from the validated query
  documentCount: number;   // integer ≥ 0
  totalGrandTotal: number; // major units, 2 decimal places
  totalTax: number;        // major units, 2 decimal places
  totalDiscount: number;   // major units, 2 decimal places
}
```

An empty range (no documents match) returns 200 with every figure set to zero,
not 404.

**Response (400):** `DATE_RANGE_INVALID` if `from` or `to` is malformed, or
`DATE_RANGE_INVERTED` if `from > to`. Both surface through the envelope's
`details[]` with the offending parameter's path.

### 1.2 `GET /api/v1/documents?from=&to=` *(amended)*

**Query parameters:** same optional `from`/`to` shape as the report endpoint,
validated through the same `dateRangeQuerySchema`.

**Response (200):** `DocumentSummary[]` — unchanged shape from Phase 3.

**Response (400):** same range-validation codes as the report endpoint.

## 2. Range semantics

- **Both ends inclusive.** A document whose `issueDate` equals `from` or `to` is
  included in the range.
- **Plain string comparison.** `issueDate` is stored and compared as a
  `YYYY-MM-DD` string; no `Date` object, UTC conversion, or server locale is
  applied.
- **Drafts included.** The report and the amended list include every document in
  the range, regardless of `status` — both `draft` and `finalized` documents
  contribute.

## 3. Error codes

Defined in `apps/backend/src/contracts/report.ts`:

| Code | Meaning |
|----|----|
| `DATE_RANGE_INVALID` | `from` or `to` is not a valid `YYYY-MM-DD` date |
| `DATE_RANGE_INVERTED` | `from` is after `to` |

Both are returned as **400** `VALIDATION_FAILED` with the domain code attached to
the offending parameter's path.

## 4. Mirroring

The frontend mirror lives at `apps/frontend/src/lib/api/types/report.ts`, per
Phase 0 §6's mirroring rule — hand-written, no code generation, kept in sync by
hand and guarded by the route's own response validation plus compile-time
type-checking against the mirror.

## 5. Guarded-route registry

Neither new/amended endpoint mutates an existing document, so neither belongs in
the `GUARDED_ROUTES` registry introduced in Phase 4. `GET /api/v1/documents` was
already unguarded; `GET /api/v1/reports/summary` is also unguarded.
