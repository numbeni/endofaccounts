# PS-03D5-5-F1 — Account Delete Fail-Closed Correction Report

## Final Status

PS-03D5-5-F1 — CORRECTION COMPLETE, AWAITING SOURCE REVIEW

## Command Center Decision Applied

Option B selected: Account hard deletion must remain fail-closed until an authoritative Assignment History model exists.

- The current `capacity_customers` table is not authoritative.
- The presence of a `capacity_customers` row may prove some historical usage.
- The absence of `capacity_customers` rows cannot prove the absence of Assignment history.
- The absence of `capacity_customers` rows must never authorize Account hard deletion.
- The future authoritative model is expected to involve Order, OrderItem, FulfillmentUnit, Assignment, and Assignment History, but those models are not designed or implemented in this correction.
- Hard Delete will be reconsidered only in a future Orders / Assignment phase after the canonical Order, OrderItem, FulfillmentUnit, Assignment, Assignment History, migration, permission, and audit contracts are approved.
- No speculative future phase number is assigned.

## Previous Behavior

- The `deleteAccount` service opened a destructive transaction, locked the Account row and its Capacities with `FOR UPDATE`, and checked `capacity_customers` for any row.
- When no `capacity_customers` rows were found, it deleted the Account's Backup Codes, Capacities, and the Account itself, and returned HTTP 204.
- When `capacity_customers` rows existed, it returned HTTP 409 with code `ACCOUNT_HAS_ASSIGNMENT_HISTORY`.
- The public production route returned HTTP 403 with the message "Account operations are not authorized".
- The OpenAPI contract documented a successful 204 hard-delete response.

## Corrected Behavior

- Public production `DELETE /api/accounts/{accountId}` returns HTTP 403 with code `ACCOUNT_OPS_DISABLED` and the exact message: `Account operations are currently disabled`.
- The public route does not invoke the real delete handler, does not perform validation, and performs zero writes.
- The internal test-mounted `deleteAccountHandler` validates the Account ID and returns HTTP 404 for missing or already-deleted Accounts, preserving the existing Account-not-found contract.
- For every existing valid Account, the internal handler returns HTTP 409 with code `ACCOUNT_DELETE_NOT_AVAILABLE` and the exact message: `Account deletion is not available until authoritative assignment history is implemented`.
- The internal delete path performs zero writes whether `capacity_customers` contains no rows, active rows, removed rows, cancelled rows, soft-deleted rows, or any current or historical form.
- The response contains no secrets, no Customer IDs, no Capacity IDs, and no SQL or internal details.

## Files Changed

```text
 M artifacts/api-server/src/lib/account-contract.test.ts
 M artifacts/api-server/src/routes/accounts.delete.test.ts
 M artifacts/api-server/src/routes/accounts.disabled.test.ts
 M artifacts/api-server/src/routes/accounts.ts
 M artifacts/api-server/src/services/account/index.ts
 M docs/CURRENT_PHASE.md
 M docs/DECISION_LOG.md
 M lib/api-client-react/src/generated/api.ts
 M lib/api-spec/openapi.yaml
 M lib/api-zod/src/generated/api.ts
```

Diff stat: 10 files changed, 213 insertions(+), 363 deletions(-).

## OpenAPI and Generated Code

- `lib/api-spec/openapi.yaml`: removed the `204 Account deleted` response from `DELETE /api/accounts/{accountId}`; updated the description to state that deletion is fail-closed in the current PS-03 contract; the 409 response now documents `Account deletion is not available until authoritative assignment history is implemented`.
- Regenerated clients through `pnpm --filter @workspace/api-spec run codegen`.
- `lib/api-client-react/src/generated/api.ts`: `deleteAccount` return type changed from `Promise<void>` to `Promise<unknown>` because the contract no longer defines a successful 204 body; `useDeleteAccount` remains available for future frontend wiring.
- `lib/api-zod/src/generated/api.ts`: regenerated; no new success-body schema for delete.
- Generated files were not manually edited.

## Tests

### Exact test files changed

- `artifacts/api-server/src/routes/accounts.delete.test.ts` — rewritten from destructive hard-delete coverage to fail-closed coverage.
- `artifacts/api-server/src/routes/accounts.disabled.test.ts` — updated the public DELETE 403 assertion to the new exact message.
- `artifacts/api-server/src/lib/account-contract.test.ts` — updated comment describing the generated delete response contract.

### Obsolete destructive tests removed or rewritten

Removed:
- "deletes an Account with no assignment history and returns 204"
- "deleted Account cannot be retrieved via GET /accounts/:id"
- "unexpected database error rolls back the complete deletion" (trigger-based rollback test)
- "unrelated Games and Accounts remain unchanged after deletion" (old success variant)
- "committed identifiers are not reused after deletion"
- "deleting an Account with no capacities still succeeds"
- "locks capacities so concurrent assignment creation cannot race past deletion"
- "delete service can be invoked directly without body parameters"

Rewritten:
- "active assignment history blocks deletion with 409 and zero writes" → "internal handler returns 409 with zero writes when active capacity_customers rows exist"
- "removed or cancelled assignment history still blocks deletion" → "internal handler returns 409 with zero writes when removed capacity_customers rows exist"
- "soft-deleted assignment history still blocks deletion" → "internal handler returns 409 with zero writes when soft-deleted capacity_customers rows exist"
- "assignment on any capacity of the Account blocks deletion" → "assignment on any capacity of the Account returns 409 with zero writes"
- "unrelated Games and Accounts remain unchanged after deletion" → "unrelated Games and Accounts remain unchanged after a delete attempt"

### New focused tests added

- Public DELETE route returns 403 with exact message and writes nothing.
- Internal handler returns 409 with zero writes when no `capacity_customers` history exists.
- Internal handler returns 409 with zero writes for active, removed, cancelled, and soft-deleted `capacity_customers` rows.
- Assignment on any capacity returns 409 with zero writes.
- Identifiers are not changed after a delete attempt.
- Validation and safety coverage (invalid UUID 400, missing Account 404, already-deleted Account 404, unexpected handler error 500) is preserved.

### Test counts

| Package | Tests | Failures |
|---|---|---|
| API server | 139 | 0 |
| DB helpers | 16 | 0 |
| DB migrations | 38 | 0 |
| Frontend | 47 | 0 |
| **Total** | **240** | **0** |

## Zero-Write Proof

The rewritten `accounts.delete.test.ts` proves zero writes for every fail-closed path by comparing row counts before and after the delete attempt:

- For the public DELETE 403 test:
  - `accounts`, `capacities`, `backupCodes`, and `capacityCustomers` counts are unchanged.
- For the internal 409 tests (no history, active, removed, cancelled, soft-deleted `capacity_customers` rows):
  - `accounts` count unchanged.
  - `capacities` count unchanged.
  - `backupCodes` count unchanged.
  - `capacityCustomers` count unchanged.
  - Account Capacities are verified unchanged by row IDs.
  - Account Backup Codes are verified unchanged by row IDs.
- For the identifier-unchanged test:
  - `accountCode`, `displayNumber`, and `accountNumberSeq` remain identical after the delete attempt.

## Validation Results

| Command | Exit Code | Result | Test Count |
|---|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | PASS | — |
| `pnpm --filter @workspace/api-spec run codegen` | 0 | PASS | — |
| `pnpm run typecheck` | 0 | PASS | — |
| `pnpm --filter @workspace/api-server run typecheck` | 0 | PASS | — |
| `pnpm --filter @workspace/api-server run test` | 0 | PASS | 139 tests, 0 failures |
| `pnpm --filter @workspace/api-server run build` | 0 | PASS | — |
| `pnpm --filter @workspace/db run test` | 0 | PASS | 16 tests, 0 failures |
| `pnpm --filter @workspace/db run test:migrations` | 0 | PASS | 38 tests, 0 failures |
| `pnpm --filter @workspace/playsyncer run test` | 0 | PASS | 47 tests, 0 failures |
| `PORT=24351 BASE_PATH=/ pnpm --filter @workspace/playsyncer run build` | 0 | PASS | — |
| `git diff --check` | 0 | PASS | — |

**Total automated tests: 240. Failures: 0.**

## Runtime Safety Proof

Public `DELETE /api/accounts/{accountId}` response (from the API server test suite):

```json
{
  "error": "Account operations are currently disabled",
  "code": "ACCOUNT_OPS_DISABLED"
}
```

The real `deleteAccountHandler` is exported but intentionally not mounted in the production router; the public route returns 403 before any handler execution.

## Database Safety

- Disposable test database only: every automated test uses `startTestPg()` and a fresh PostgreSQL instance.
- Normal development database untouched.
- No schema or migration change.
- No production DB architecture change.
- No `capacity_customers` schema change.
- No Account identifier allocation change.
- No Capacity template or Backup Code schema change.

## Execution Log

1. Inspected the existing `deleteAccount` service, `deleteAccountHandler`, `accounts.delete.test.ts`, OpenAPI contract, generated clients, and phase documentation.
2. Identified the superseded contract: HTTP 204 hard-delete when no `capacity_customers` rows exist.
3. Removed the destructive `deleteAccount` transaction and replaced it with a fail-closed lookup that throws `AccountDeleteNotAvailableError`.
4. Added `AccountDeleteNotAvailableError` to the service and removed the now-unused `capacityCustomersTable` and `inArray` imports from the service.
5. Updated `deleteAccountHandler` to map the new error to HTTP 409 with the approved message and code.
6. Updated the public DELETE route to return the exact new HTTP 403 message while preserving other mutation routes with the existing shared message.
7. Updated the OpenAPI `DELETE /api/accounts/{accountId}` contract to remove 204 and document 409 `ACCOUNT_DELETE_NOT_AVAILABLE`.
8. Regenerated React and Zod clients via the existing codegen workflow; verified generated code typechecks.
9. Rewrote `accounts.delete.test.ts` from destructive success/concurrency tests to fail-closed coverage, including all `capacity_customers` row states.
10. Updated `accounts.disabled.test.ts` to expect the new public DELETE 403 message.
11. Updated `account-contract.test.ts` comment to reflect the removal of the 204 response.
12. Updated `docs/CURRENT_PHASE.md` to PS-03D5-5-F1 CORRECTION COMPLETE, AWAITING SOURCE REVIEW, and corrected the parent sub-stage status.
13. Updated `docs/DECISION_LOG.md` with the authoritative Command Center decision and validation results.
14. Failed attempt: `pnpm --filter @workspace/api-server run test` initially failed because `accountCapacitiesTable` and `accountBackupCodesTable` imports were accidentally removed from the service; they are still needed by `createAccount`. Re-added the imports and reran tests successfully.
15. Ran the full 11-command validation suite and captured actual exit codes and test counts.
16. Created the review package, diff, manifest, and validation artifacts.

No failures, skipped tests, or warnings were hidden.

## Remaining Issues

### Blockers

None.

### Must fix before mutation activation

- Online ID case-preservation and case-insensitive advisory-lock normalization.
- Server-side error-log redaction for database parameters and sensitive internal details.

### Deferred future Assignment/Orders work

- Authoritative Assignment History model (Order, OrderItem, FulfillmentUnit, Assignment, Assignment History).
- Reconsideration of Account hard deletion only after those contracts are approved.
- No speculative phase number assigned.

### Cleanup-only items

None.

## Deliverables

- `reports/ps03d5-5-f1-delete-fail-closed-report.md`
- `reports/ps03d5-5-f1-delete-fail-closed.diff`
- `reports/ps03d5-5-f1-delete-fail-closed-validation.txt`
- `reports/ps03d5-5-f1-delete-fail-closed-manifest.txt`
- `playsyncer-ps03d5-5-f1-delete-fail-closed-review.zip`

## Final Git Status

```text
 M artifacts/api-server/src/lib/account-contract.test.ts
 M artifacts/api-server/src/routes/accounts.delete.test.ts
 M artifacts/api-server/src/routes/accounts.disabled.test.ts
 M artifacts/api-server/src/routes/accounts.ts
 M artifacts/api-server/src/services/account/index.ts
 M docs/CURRENT_PHASE.md
 M docs/DECISION_LOG.md
 M lib/api-client-react/src/generated/api.ts
 M lib/api-spec/openapi.yaml
 M lib/api-zod/src/generated/api.ts
?? attached_assets/Pasted-Continue-in-the-current-local-PlaySyncer-workspace-Star_1784472588257.txt
?? reports/ps03d5-5-f1-delete-fail-closed-report.md
?? reports/ps03d5-5-f1-delete-fail-closed.diff
?? reports/ps03d5-5-f1-delete-fail-closed-validation.txt
?? reports/ps03d5-5-f1-delete-fail-closed-manifest.txt
?? playsyncer-ps03d5-5-f1-delete-fail-closed-review.zip
```

No commit was made. PS-03D5-6 is not started automatically.
