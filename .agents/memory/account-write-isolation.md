---
name: Account Write Feature Isolation
description: The account-write feature dir is implemented but must never be imported in production pages until Security phase approval.
---

# Account Write Feature Isolation

## Rule
`artifacts/playsyncer/src/features/account-write/` must NOT be imported by:
- `artifacts/playsyncer/src/App.tsx`
- `artifacts/playsyncer/src/pages/GameDetailPage.tsx`
- `artifacts/playsyncer/src/components/AccountCardReadOnly.tsx`
- `artifacts/playsyncer/src/components/AccountDetailsReadOnly.tsx`
- any other mounted production component

**Why:** PS-03D5 keeps Account mutations runtime-disabled. All public POST/PATCH/DELETE account routes return 403 ACCOUNT_OPS_DISABLED. Activation requires a future Security phase with explicit Command Center approval.

**How to apply:** When adding new components or pages, do not import from `@/features/account-write`. The isolation.test.tsx file verifies this and will fail if the feature is accidentally mounted.

## Also

The feature barrel (`index.ts`) must NOT re-export `deleteAccount` or `useDeleteAccount` — enforced by isolation.test.tsx.

No feature flags, hidden routes, or environment-variable bypasses are permitted.
