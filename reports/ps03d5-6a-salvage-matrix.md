# PS-03D5-6A Salvage Matrix

## Sub-stage
PS-03D5-6A — Account Write Frontend Core Reconstruction

## Purpose
Documents which donor v4 defects were identified and how each was addressed.

---

## Defect → Fix Matrix

| # | Defect Category | Symptom | Fix Applied |
|---|----------------|---------|-------------|
| 1 | Wrong error path | Donor read `error.response.data` | `parseApiError.ts` reads `error.data` (ApiError shape) |
| 2 | Wrong error detection | Donor checked `Error.message` for `ACCOUNT_OPS_DISABLED` | `parseApiError.ts` checks `data.code === "ACCOUNT_OPS_DISABLED"` |
| 3 | Raw message render | Donor rendered `error.message` directly in UI | `safeMutationErrorMessage()` returns only approved Persian strings |
| 4 | Delete hook import | Donor imported `useDeleteAccount` in DeleteUnavailableDialog | DeleteUnavailableDialog does NOT import any delete function |
| 5 | statusOverride in Create | Donor exposed statusOverride in CreateAccountDialog | CreateAccountDialog has no statusOverride field |
| 6 | Password prefill | Donor prefilled PSN password from DTO in EditAccountDialog | Passwords always start empty in EditAccountDialog |
| 7 | Duplicate auto-loop | Donor re-opened DuplicateWarningDialog on second warning | Second DUPLICATE_WARNING treated as generic error (no retry loop) |
| 8 | Backup codes in Edit | Donor allowed editing backup codes in EditAccountDialog | EditAccountDialog shows only a read-only notice |
| 9 | Immutable fields in payload | Donor submitted accountCode/displayNumber in Update | buildChangedPayload() excludes all immutable identifiers |
| 10 | Calendar validation | Donor relied only on Date.parse (accepts Feb 31) | validateBirthDate uses `new Date(year, month, 0).getDate()` for true last-day |
| 11 | currentOverride requirement | Donor required currentOverride from safe DTO | StatusOverrideDialog does NOT require currentOverride |
| 12 | Raw duplicate values | Donor showed raw field values in DuplicateWarningDialog | DuplicateWarningDialog shows only DUPLICATE_FIELD_LABELS (Persian labels) |

---

## Items Not Salvaged (Rebuilt From Scratch)

All seven dialog components and two utility files were written fresh, guided by the defect list above. No donor v4 code was copied.

---

## Isolation Decisions

| Decision | Rationale |
|----------|-----------|
| Feature not mounted in App.tsx | No activation until Security phase approval |
| Feature not mounted in GameDetailPage | Matches PS-03D5 runtime-disabled requirement |
| No feature flags or hidden routes | Prevents accidental activation in production |
| No environment bypass | Prevents bypass via `NODE_ENV` or similar |
| No deleteAccount import anywhere | Enforces hard-delete unavailability at import level |
