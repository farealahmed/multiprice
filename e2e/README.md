# E2E selector convention

UI lanes tag interactive and stateful elements with `data-testid`. Cypress tests select on `[data-testid="..."]`.

No lint rule enforces this in Phase 0; PR review catches drift.

## Phase 0 selectors

| Element | `data-testid` |
|---|---|
| Backend status badge | `health-backend-status` |
| Database status badge | `health-db-status` |
| App version string | `health-version` |
| Failure-state retry button | `health-retry` |
