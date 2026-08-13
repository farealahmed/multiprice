# Phase 4 — Lifecycle and Immutability

This document freezes the wire representation for the document lifecycle domain,
added in this phase. It is the source later phases' README is written from. See
`docs/contracts/phase-0.md` for the cross-cutting decisions (error envelope,
mirroring rule, conventions) this phase reuses unchanged, and
`docs/contracts/phase-3.md` for the document/line-item shapes this phase builds
on without changing.

## 1. Lifecycle endpoints

| Method | Path | Auth | Purpose |
|----|----|----|----|
| `POST` | `/api/v1/documents/:id/finalize` | session | Recompute totals and lock a draft document |
| `POST` | `/api/v1/documents/:id/duplicate` | session | Create a new draft copied from any source document (4-D) |

All endpoints are same-origin; the frontend client calls relative
`/api/v1/documents/...` URLs and the session cookie is sent automatically.

### 1.1 `POST /api/v1/documents/:id/finalize`

**Response (200):** `DocumentResponse` with `status: 'finalized'`. The response
shape is identical to `GET /api/v1/documents/:id`; this endpoint introduces no
new response type.

**Response (400):** `DOCUMENT_HAS_NO_LINES` if the document has zero lines, or
a per-line validation code if the persisted lines fail revalidation through the
normal pricing engine.

**Response (404):** `DOCUMENT_NOT_FOUND` if the document does not exist or is
not owned by the caller. Another owner's document id also yields 404, never 409.

**Response (409):** `DOCUMENT_FINALIZED` if the document is already finalized
(either because of a concurrent request or because it was finalized earlier).

### 1.2 `POST /api/v1/documents/:id/duplicate` *(Lane 4-D)*

**Response (201):** `DocumentResponse` for the new draft. The new document has
fresh document and line ids, a title suffixed with `(copy)`, `issueDate` set to
today, and totals recomputed (not copied). A finalized source document may be
duplicated.

**Response (404):** `DOCUMENT_NOT_FOUND` if the source document does not exist
or is not owned by the caller.

## 2. Existing document endpoints gain a 409 response

Every Phase 3 endpoint that mutates an existing document now also returns
**409 `DOCUMENT_FINALIZED`** when the target document is already finalized.
Non-mutating endpoints (`GET /api/v1/documents`, `GET /api/v1/documents/:id`)
and the creation endpoint (`POST /api/v1/documents`) are unaffected.

## 3. Guarded-route registry

`apps/backend/src/api/routes/registry.ts` is the single source of truth for the
set of routes the immutability guard protects:

| Method | Path |
|----|----|
| `PATCH` | `/api/v1/documents/:id` |
| `DELETE` | `/api/v1/documents/:id` |
| `POST` | `/api/v1/documents/:id/lines` |
| `PATCH` | `/api/v1/documents/:id/lines/:lineId` |
| `DELETE` | `/api/v1/documents/:id/lines/:lineId` |
| `POST` | `/api/v1/documents/:id/finalize` |

`POST /api/v1/documents` is intentionally absent (it creates, it does not
mutate). `POST /api/v1/documents/:id/duplicate` is also absent: it creates a new
document and never mutates the source.

## 4. Error codes

Defined in `apps/backend/src/contracts/lifecycle.ts`:

| Code | Meaning |
|----|----|
| `DOCUMENT_FINALIZED` | The document is already finalized; the requested mutation is not allowed |
| `DOCUMENT_HAS_NO_LINES` | `finalize` was called on a document with no lines |

`DOCUMENT_FINALIZED` is returned as **409** (lifecycle conflict). `DOCUMENT_HAS_NO_LINES`
is returned as **400** (precondition-not-met on the finalize input state).

## 5. Mirroring

The frontend mirror lives at `apps/frontend/src/lib/api/types/lifecycle.ts`, per
Phase 0 §6's mirroring rule — hand-written, no code generation, kept in sync by
hand and guarded by the route's own response validation plus compile-time
type-checking against the mirror.
