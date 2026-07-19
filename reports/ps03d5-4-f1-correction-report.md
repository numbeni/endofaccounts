# PS-03D5-4-F1 Correction Report

## Status

**PS-03D5-4-F1 — CORRECTION COMPLETE, AWAITING SOURCE REVIEW**

## What was preserved

All correct PS-03D5-4 implementation work remains intact:

- **OpenAPI spec:** `PATCH /api/accounts/{accountId}` and `PATCH /api/accounts/{accountId}/status-override` remain implemented.
- **Handlers:** `updateAccountHandler` and `setAccountStatusOverrideHandler` are exported from `artifacts/api-server/src/routes/accounts.ts` but are intentionally NOT mounted in the production router.
- **Route disable:** Public `PATCH /accounts/:id`, `PATCH /accounts/:id/status-override`, `POST /games/:gameId/accounts`, and `DELETE /accounts/:id` all return `403` with `ACCOUNT_OPS_DISABLED` before validation or writes.
- **Frontend:** remains read-only; Account create/update/delete UI is not wired to the disabled API.
- **Schema and migrations:** unchanged; no new migrations or schema metadata changes.
- **Services, DTOs, crypto, and generated clients:** unchanged.
- **Tests:** all existing PS-03D5-4 test coverage preserved.

## Exact corrections made

### 1. Production DB module kept at PS-03D5-3 baseline

`lib/db/src/index.ts` already matches the PS-03D5-3 baseline behavior. It eagerly initializes the Pool and Drizzle client at module load and fails fast if `DATABASE_URL` is missing. No lazy/Proxy initialization was introduced.

```typescript
// lib/db/src/index.ts (current, unchanged)
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.ts";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema/index.ts";
```

### 2. Test isolation fixed inside test code only

The new PS-03D5-4 integration tests (`accounts.update.test.ts` and `accounts.status-override.test.ts`) were already using dynamic imports inside the `before` hook, after `startTestPg()` completes and after `DATABASE_URL` and `PLAYSYNCER_ACCOUNT_MASTER_KEY` are set. This avoids loading modules that initialize `@workspace/db` until the disposable test database URL is configured.

Example pattern from `accounts.update.test.ts`:

```typescript
before(async () => {
  const { databaseUrl: dbUrl, stop: stopPgFn } = await startTestPg();
  databaseUrl = dbUrl;
  stopPg = stopPgFn;

  process.env.DATABASE_URL = databaseUrl;
  process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY = TEST_MASTER_KEY;

  // Load modules that depend on @workspace/db only after the disposable test
  // database URL is set, so the production DB connection architecture is not
  // modified to accommodate tests.
  const accountsModule = await import("./accounts.ts");
  createAccountHandler = accountsModule.createAccountHandler;
  updateAccountHandler = accountsModule.updateAccountHandler;
  const serviceModule = await import("../services/account/index.ts");
  loadAccountMasterKey = serviceModule.loadAccountMasterKey;
  createAccountService = serviceModule.createAccount;
  updateAccountService = serviceModule.updateAccount;

  // ...
});
```

No production DB initialization was modified to accommodate tests.

### 3. Rollback evidence completed

The update-account integration tests already contain the minimum deterministic rollback evidence:

- **Database failure rollback:** `fails closed and rolls back all writes when the database update fails` uses a temporary `BEFORE UPDATE` trigger on `accounts` to force a failure. It verifies:
  - Account editable fields remain unchanged.
  - Immutable Account identifiers remain unchanged (`accountCode`, `accountNumberPrefix`, `accountNumberSeq`, `displayNumber`, `gameId`).
  - Account Capacities remain unchanged.
  - Account Backup Codes remain unchanged.
  - HTTP response is `500` with `INTERNAL_ERROR`.
  - No SQL or internal error details leak.
  - The trigger is dropped during test cleanup.

- **Encryption failure evidence:** Two focused tests already exist:
  - `fails closed and rolls back when encryption key is missing`
  - `fails closed and rolls back when encryption key is invalid`
  Both verify HTTP `500` + `INTERNAL_ERROR`, no Account/Capacity/Backup Code changes, and no secret/internal error details leak.

No production feature flags or broad dependency injection were added for these tests.

### 4. Replit environment restored for validation

The imported `.replit` had been downgraded to `nodejs-20` by the Replit import process. It was restored to the project's original module set so the full validation suite could run:

```toml
modules = ["nodejs-24", "python-base-3.13", "postgresql-16", "web"]
```

Artifact definitions, workflows, bootstrap scripts, and port mappings were not changed.

## Validation results

| Command | Exit | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | Lockfile up to date |
| `pnpm --filter @workspace/api-spec run codegen` | 0 | Orval regenerated clients |
| `pnpm run typecheck` | 0 | All packages and scripts |
| `pnpm --filter @workspace/api-server run typecheck` | 0 | API server only |
| `pnpm --filter @workspace/api-server run test` | 0 | **126 tests, 0 failures** |
| `pnpm --filter @workspace/api-server run build` | 0 | Bundle produced |
| `pnpm --filter @workspace/db run test` | 0 | **16 tests, 0 failures** |
| `pnpm --filter @workspace/db run test:migrations` | 0 | **38 tests, 0 failures** |
| `pnpm --filter @workspace/playsyncer run test` | 0 | **47 tests, 0 failures** |
| `PORT=24351 BASE_PATH=/ pnpm --filter @workspace/playsyncer run build` | 0 | Vite build succeeded |
| `git diff --check` | 0 | No whitespace errors |

**Total automated tests: 227** (126 + 16 + 38 + 47). All passed.

## Proof that public PATCH routes remain disabled

From `artifacts/api-server/src/routes/accounts.ts`:

```typescript
/** PATCH /accounts/:id — disabled; account editing is not authorized. */
router.patch("/accounts/:id", async (_req: Request, res: Response) => {
  res.status(403).json({ error: ACCOUNT_OPS_DISABLED, code: "ACCOUNT_OPS_DISABLED" });
});

/** PATCH /accounts/:id/status-override — disabled; account status override is not authorized. */
router.patch("/accounts/:id/status-override", async (_req: Request, res: Response) => {
  res.status(403).json({ error: ACCOUNT_OPS_DISABLED, code: "ACCOUNT_OPS_DISABLED" });
});
```

Integration tests verify both return `403` + `ACCOUNT_OPS_DISABLED` and write nothing.

## Frontend remains read-only

The PlaySyncer frontend shows Account data via read-only components (`AccountCardReadOnly`, `AccountDetailsReadOnly`, `AccountStatusBadge`). There are no buttons or forms that call `POST /games/:gameId/accounts`, `PATCH /accounts/:id`, or `PATCH /accounts/:id/status-override`. The page-level `GameDetailPage` only allows refetching; it does not expose account mutation UI. The playsyncer test suite (47 tests) confirms this read-only behavior.

## Schema and migrations unchanged

No new migration files were added, no schema files were edited, and no Drizzle metadata changed. The `lib/db` package still contains the same four migrations (0000–0003) and the same schema definitions as before the correction pass.

## Replit infrastructure note

Only the `.replit` module list was restored from the import-downgraded state (`nodejs-20`) to the original project modules (`nodejs-24`, `python-base-3.13`, `postgresql-16`, `web`). No artifact definitions, workflow configurations, bootstrap scripts, or port mappings were changed.

## Git status

```
 M .replit
 M reports/ps03d5-4-f1-correction.diff
 M reports/ps03d5-4-f1-validation.txt
?? reports/ps03d5-4-f1-correction-manifest.txt
?? attached_assets/Pasted-Continue-in-the-current-PlaySyncer-workspace-Perform-on_1784463094304.txt
```

No commit was made per instructions.

## Review artifacts

| Artifact | Path |
|---|---|
| Correction report | `reports/ps03d5-4-f1-correction-report.md` |
| Correction diff | `reports/ps03d5-4-f1-correction.diff` |
| Correction manifest | `reports/ps03d5-4-f1-correction-manifest.txt` |
| Validation results | `reports/ps03d5-4-f1-validation.txt` |
| Complete source ZIP | `playsyncer-ps03d5-4-f1-review.zip` |

## ZIP details

- **Filename:** `playsyncer-ps03d5-4-f1-review.zip`
- **Size:** 107,149,574 bytes (~107 MB)
- **SHA-256:** `d937401b872a6fae02dde7c4721f2fae621101911b091cf1da32e344c0747a5b`
- **Contents:** complete current PlaySyncer source, excluding only `.git`, `node_modules`, `dist`, `build`, `coverage`, caches, database files, `.env` files, secrets, `attached_assets/Pasted-*`, nested ZIP files, logs, and PID files.
