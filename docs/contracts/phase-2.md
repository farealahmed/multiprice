# Phase 2 — Authentication and Ownership

This document freezes the wire representation for the authentication domain,
added in this phase. It is the source Phase 6's README is written from. See
`docs/contracts/phase-0.md` for the cross-cutting decisions (error envelope,
mirroring rule, conventions) this phase reuses unchanged.

## 1. Auth endpoints

| Method | Path | Auth | Purpose |
|----|----|----|----|
| `POST` | `/auth/signup` | public | Create an account and start a session |
| `POST` | `/auth/login` | public | Sign in to an existing account |
| `POST` | `/auth/logout` | session | End the current session |
| `GET` | `/auth/me` | session | Return the current session's user |

All four endpoints are same-origin; the frontend client calls relative `/auth/...`
URLs and the cookie is sent automatically.

### 1.1 `POST /auth/signup`

**Request body:** `SignupInput`

**Response (200):** `SessionUser`

**Response (400):** the standard `ErrorEnvelope` with `details[].code` set to one
of this domain's validation codes (`EMAIL_INVALID`, `PASSWORD_TOO_SHORT`).

**Response (409):** the standard `ErrorEnvelope` with `code: 'EMAIL_TAKEN'`.

### 1.2 `POST /auth/login`

**Request body:** `LoginInput`

**Response (200):** `SessionUser`

**Response (401):** the standard `ErrorEnvelope` with `code: 'INVALID_CREDENTIALS'`.
This code is used for both an unknown email and a wrong password, and the two
failure paths do equal work so timing cannot enumerate accounts.

### 1.3 `POST /auth/logout`

**Response (204):** No content. The response clears the session cookie with the
same attributes it was set with.

### 1.4 `GET /auth/me`

**Response (200):** `SessionUser` for the current session.

**Response (401):** the standard `ErrorEnvelope` with `code: 'UNAUTHENTICATED'`.

## 2. `SignupInput` / `LoginInput`

```ts
type SignupInput = {
  email: string;    // must contain a local-part, '@', and a domain with a TLD
  password: string; // ≥ 12 and ≤ 128 characters, no composition rules
};

type LoginInput = {
  email: string;
  password: string;
};
```

| Field | Type | Constraint | Rejection code |
|----|----|----|----|
| `email` | `string` | well-formed email shape | `EMAIL_INVALID` |
| `password` | `string` | ≥ 12 chars, ≤ 128 chars | `PASSWORD_TOO_SHORT` (under min); shape failure (over max) |

Email case and surrounding whitespace are accepted on the wire; normalization
(lowercased + trimmed) happens before storage, and the unique index on
`users.email` is on the normalized value.

## 3. `SessionUser`

```ts
type SessionUser = {
  id: string;        // User._id as hex
  email: string;     // normalized email
  createdAt: string; // ISO 8601 timestamp
};
```

`SessionUser` structurally excludes `passwordHash`; the hash never leaves the
repository layer.

## 4. Session cookie

The session is a JWT signed with `JWT_SECRET`, delivered in an httpOnly cookie
named by `COOKIE_NAME` (default `mp_session`).

Cookie attributes:

- `HttpOnly` — never readable from `document.cookie`
- `SameSite=Lax`
- `Secure` in production
- 7-day expiry from issuance

## 5. JWT claims

The token payload carries exactly these claims:

```ts
{ sub: string; iat: number; exp: number }
```

- `sub` — the user's `_id` as a string
- `iat` / `exp` — set by `@fastify/jwt`; `exp` is 7 days after `iat`

No `email`, no role, no other fields are included in the token.

## 6. Ownership rule

Starting in Phase 3, every repository method that reads or writes user-owned
data requires `ownerId` as its first parameter and merges it into the Mongo
filter. An unscoped call is a missing-argument compile error, not a runtime data
leak. The `users` collection itself is not scoped this way — a user is not owned
by another user.

## 7. Error codes

Defined in `apps/backend/src/contracts/auth.ts`:

| Code | Meaning |
|----|----|
| `EMAIL_TAKEN` | The normalized email is already in use |
| `INVALID_CREDENTIALS` | Unknown email or wrong password (indistinguishable) |
| `UNAUTHENTICATED` | Missing, expired, or invalid session cookie |
| `PASSWORD_TOO_SHORT` | Password is under 12 characters |
| `EMAIL_INVALID` | Email does not match the required shape |

Validation failures (`PASSWORD_TOO_SHORT`, `EMAIL_INVALID`) flow through the
existing `ErrorEnvelope` with `details[].code` populated by the schema's custom
zod issues.

## 8. Rate limiting

A global, per-IP rate limit applies across the entire API (not just auth
endpoints). It returns `429` with the standard envelope shape and a
`Retry-After` header:

```ts
{ error: { code: 'RATE_LIMITED', message: 'Too many requests, try again shortly.' } }
```

The rate limiter is active in development and production and is skipped under
`NODE_ENV=test` so automated test suites are not tripped by burst traffic.

## 9. Mirroring

The frontend mirror lives at `apps/frontend/src/lib/api/types/auth.ts`, per
Phase 0 §6's mirroring rule — hand-written, no code generation, kept in sync by
hand and guarded by the route's own response validation plus compile-time
type-checking against the mirror.
