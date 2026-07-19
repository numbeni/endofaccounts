# PS-03D5-6A-F1 Execution Log

## Sub-stage
PS-03D5-6A-F1 — Account Write Core Contract and Packaging Correction

## Status
CORRECTION COMPLETE

## Date
2026-07-19

---

## Corrections Applied

### 1. Preserve Password values exactly

Files: `CreateAccountDialog.tsx`, `EditAccountDialog.tsx`

- Removed `.trim()` from `psnPassword` and `emailPassword` in payload construction.
- Create validation checks `value.length > 0` (not `value.trim().length > 0`).
- Edit optional passwords are included only when their exact value is non-empty (`length > 0`).
- Added tests proving leading/trailing spaces are preserved and sent exactly.

### 2. Clear Create secrets on every close path

File: `CreateAccountDialog.tsx`

- `useEffect` on `open` now clears `psnPassword`, `emailPassword`, `backupCodes`, pending duplicate payload, duplicate-warning state, and `confirmedOnce` flag when transitioning to `open=false`.
- Added test that enters all secrets, closes externally, reopens, and verifies every sensitive field is empty plus the retry state is reset.

### 3. Mask Password fields

Files: `CreateAccountDialog.tsx`, `EditAccountDialog.tsx`

- All four password inputs (Create PSN, Create Email, Edit PSN, Edit Email) use `type="password"`.
- No secret-reveal toggle was added.

### 4. Do not display unknown duplicate field names

File: `DuplicateWarningDialog.tsx`

- Added `GENERIC_FIELD_LABEL = "فیلد مشابه"`.
- Unknown field names fall back to the generic Persian label instead of rendering the raw name.
- Added dedicated test file with a case proving raw internal names are absent.

### 5. Correct Edit empty-field behavior

File: `EditAccountDialog.tsx`

- If `account.onlineId` exists and the user clears it, validation shows `Online ID نمی‌تواند خالی باشد`.
- If `account.birthDate` exists and the user clears it, validation shows `تاریخ تولد نمی‌تواند خالی باشد`.
- `buildChangedPayload` no longer assigns `undefined` to cleared DTO fields.
- Added focused tests for both fields and for payload with no `undefined` values.

### 6. Reset Status Override state

File: `StatusOverrideDialog.tsx`

- Added `useEffect` on `open` that clears `selected` and `errorMsg` when the dialog closes externally or reopens.
- Updated descriptions to the exact approved strings:
  - SOLD: `اکانت به‌صورت دستی فروخته‌شده در نظر گرفته می‌شود`
  - INACTIVE: `اکانت از چرخه استفاده و فروش خارج می‌شود`
  - Clear: `وضعیت دوباره از اطلاعات معتبر سیستم محاسبه می‌شود`
- Added tests for state reset and approved descriptions.

### 7. Correct phase documentation

File: `docs/CURRENT_PHASE.md`

- Current status set to `PS-03D5-6A — IMPLEMENTATION COMPLETE, AWAITING SOURCE REVIEW`.
- Next planned sub-stage: `PS-03D5-6B — Frontend Safety and Final Verification`.
- `PS-03D5-7`: `NOT AUTHORIZED`.
- Did not mark PS-03D5-6A approved or closed.

### 8. Scope guard

- Did not mount Account Write UI.
- Did not remove `ACCOUNT_OPS_DISABLED` gates.
- Did not enable public mutation routes.
- Did not add Backup Code lifecycle, Secret Reveal, Auth, RBAC, Orders, or Assignment work.

---

## Files Changed

- `artifacts/playsyncer/src/features/account-write/CreateAccountDialog.tsx`
- `artifacts/playsyncer/src/features/account-write/EditAccountDialog.tsx`
- `artifacts/playsyncer/src/features/account-write/DuplicateWarningDialog.tsx`
- `artifacts/playsyncer/src/features/account-write/StatusOverrideDialog.tsx`
- `artifacts/playsyncer/src/features/account-write/__tests__/CreateAccountDialog.test.tsx`
- `artifacts/playsyncer/src/features/account-write/__tests__/EditAccountDialog.test.tsx`
- `artifacts/playsyncer/src/features/account-write/__tests__/StatusOverrideDialog.test.tsx`
- `artifacts/playsyncer/src/features/account-write/__tests__/DuplicateWarningDialog.test.tsx` (new)
- `docs/CURRENT_PHASE.md`

---

## Validation Summary

| Command | Exit Code | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | PASS |
| `pnpm run typecheck` | 0 | PASS |
| `pnpm --filter @workspace/playsyncer run test` | 0 | PASS (161/161) |
| `pnpm --filter @workspace/playsyncer run test -- --reporter=verbose` | 0 | PASS (161/161) |
| `PORT=24351 BASE_PATH=/ pnpm --filter @workspace/playsyncer run build` | 0 | PASS |
| `git diff --check` | 0 | PASS |

