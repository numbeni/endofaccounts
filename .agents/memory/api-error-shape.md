---
name: ApiError Shape
description: How to parse API errors from the custom-fetch ApiError class — read error.data not error.response.
---

# ApiError Shape

## Rule
The `ApiError` class (in `lib/api-client-react/src/custom-fetch.ts`) stores the structured response body at `error.data`, not `error.response`.

- `error.data.code` — machine-readable error code (e.g. `"DUPLICATE_WARNING"`, `"ACCOUNT_OPS_DISABLED"`)
- `error.data.error` — human-readable message (DO NOT render to users)
- `error.status` — HTTP status code

**Why:** A donor codebase read `error.response.data` which silently returned undefined, causing all errors to fall through as generic. The correct field is `error.data`.

**How to apply:** Always use `parseMutationError(err)` from `artifacts/playsyncer/src/features/account-write/parseApiError.ts` to classify errors. Never read `error.response`, `error.message`, or `Error.message` for code detection.

## Approved Error Codes
- `DUPLICATE_WARNING` — detected from `data.code`; opens DuplicateWarningDialog
- `ACCOUNT_OPS_DISABLED` — detected from `data.code`; shows PERSIAN_DISABLED_MSG
- everything else → generic; shows PERSIAN_GENERIC_MSG
