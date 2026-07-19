import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import express, { type Express } from "express";
import net from "node:net";
import { eq, sql } from "drizzle-orm";
import { startTestPg, startApiServer } from "../lib/test-pg.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { errorHandler } from "../middlewares/error-handler.ts";
import { p } from "../lib/req-param.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "..", "dist");

const TEST_MASTER_KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef",
  "utf8",
).toString("base64");

let deleteAccountHandler: typeof import("./accounts.ts")["deleteAccountHandler"];
let createAccountService: typeof import("../services/account/index.ts")["createAccount"];

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `${Date.now()}_${idCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    psnEmail: `test-${nextId()}@example.com`,
    psnPassword: "psn-secret",
    emailPassword: "email-secret",
    onlineId: `TestOnlineId${nextId()}`,
    birthDate: "1990-01-01",
    familyManagementEmail: `family-${nextId()}@example.com`,
    backupCodes: ["code1", "code2"],
    ...overrides,
  };
}

function buildTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.delete("/accounts/:id", (req, res, next) => {
    const id = p(req.params["id"]);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      res.status(400).json({ error: "id must be a valid UUID", code: "VALIDATION_ERROR" });
      return;
    }
    deleteAccountHandler(req, res, next);
  });
  app.use(errorHandler);
  return app;
}

describe("Delete Account handler", { concurrency: 1 }, () => {
  let databaseUrl: string;
  let stopPg: () => Promise<void>;
  let db: typeof import("@workspace/db");

  let publicBaseUrl: string;
  let stopPublicServer: () => Promise<void>;
  let testApp: Express;
  let testServer: ReturnType<typeof express.application.listen>;
  let testPort: number;

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
    deleteAccountHandler = accountsModule.deleteAccountHandler;
    const serviceModule = await import("../services/account/index.ts");
    createAccountService = serviceModule.createAccount;

    execSync("pnpm run build", {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        PORT: "8080",
        BASE_PATH: "/api-server",
      },
      stdio: "ignore",
    });

    const { baseUrl: serverUrl, stop: stopServerFn } = await startApiServer(
      databaseUrl,
      DIST_DIR,
    );
    publicBaseUrl = serverUrl;
    stopPublicServer = stopServerFn;

    db = await import("@workspace/db");

    testApp = buildTestApp();
    testPort = await getFreePort();
    testServer = testApp.listen(testPort);
  });

  after(async () => {
    if (testServer) {
      testServer.close();
    }
    await stopPublicServer();
    if (db) {
      await db.pool.end();
    }
    await stopPg();
  });

  function deleteUrl(accountId: string): string {
    return `http://localhost:${testPort}/accounts/${accountId}`;
  }

  async function createGame(
    title: string,
    platform: "PS5_ONLY" | "PS4_AND_PS5" | "PS4_ONLY" = "PS5_ONLY",
  ) {
    const uniqueTitle = `${title} ${nextId()}`;
    const [game] = await db.db
      .insert(db.gamesTable)
      .values({
        title: uniqueTitle,
        titleNormalized: uniqueTitle.toLowerCase().trim(),
        platform,
        status: "ACTIVE",
      })
      .returning();
    return game;
  }

  async function createAccount(gameId: string) {
    const result = await createAccountService({
      ...createRequest(),
      gameId,
    });
    assert.strictEqual(result.kind, "created");
    if (result.kind !== "created") throw new Error("failed to create account");
    return result.account;
  }

  async function countRows(table: unknown): Promise<number> {
    const [row] = (await db.db
      .select({ count: sql`count(*)::int` })
      .from(table as never)) as { count: number }[];
    return row.count;
  }

  async function getRowCounts() {
    return {
      accounts: await countRows(db.accountsTable),
      capacities: await countRows(db.accountCapacitiesTable),
      backupCodes: await countRows(db.accountBackupCodesTable),
      capacityCustomers: await countRows(db.capacityCustomersTable),
    };
  }

  async function getAccountCapacities(accountId: string) {
    return db.db
      .select()
      .from(db.accountCapacitiesTable)
      .where(eq(db.accountCapacitiesTable.accountId, accountId))
      .orderBy(
        db.accountCapacitiesTable.capacityKindV2,
        db.accountCapacitiesTable.instanceNo,
      );
  }

  async function getBackupCodes(accountId: string) {
    return db.db
      .select()
      .from(db.accountBackupCodesTable)
      .where(eq(db.accountBackupCodesTable.accountId, accountId));
  }

  async function createOrder() {
    const [order] = await db.db
      .insert(db.ordersTable)
      .values({
        orderCode: `ORD-${nextId()}`,
        source: "manual",
        status: "pending_assignment",
      })
      .returning();
    return order;
  }

  async function createAssignment(
    capacityId: string,
    orderId: string,
    status: "active" | "removed" | "cancelled" = "active",
    deletedAt?: Date,
  ) {
    const [assignment] = await db.db
      .insert(db.capacityCustomersTable)
      .values({
        capacityId,
        orderId,
        customerPhoneEncrypted: "encrypted-phone",
        status,
        deletedAt: deletedAt ?? null,
      })
      .returning();
    return assignment;
  }

  async function assertAccountDeleteNotAvailable(
    accountId: string,
  ): Promise<{ before: ReturnType<typeof getRowCounts> extends Promise<infer T> ? T : never }> {
    const before = await getRowCounts();
    const beforeCapacities = await getAccountCapacities(accountId);
    const beforeBackupCodes = await getBackupCodes(accountId);

    const res = await fetch(deleteUrl(accountId), { method: "DELETE" });
    assert.strictEqual(res.status, 409);
    const data = (await res.json()) as { error: string; code: string };
    assert.strictEqual(
      data.error,
      "Account deletion is not available until authoritative assignment history is implemented",
    );
    assert.strictEqual(data.code, "ACCOUNT_DELETE_NOT_AVAILABLE");
    assertNoSecrets(JSON.stringify(data));

    const after = await getRowCounts();
    assert.strictEqual(after.accounts, before.accounts, "account not deleted");
    assert.strictEqual(after.capacities, before.capacities, "capacities not deleted");
    assert.strictEqual(after.backupCodes, before.backupCodes, "backup codes not deleted");
    assert.strictEqual(
      after.capacityCustomers,
      before.capacityCustomers,
      "capacity_customers not changed",
    );
    assert.deepStrictEqual(
      (await getAccountCapacities(accountId)).map((c) => c.id),
      beforeCapacities.map((c) => c.id),
      "capacities unchanged",
    );
    assert.deepStrictEqual(
      (await getBackupCodes(accountId)).map((c) => c.id),
      beforeBackupCodes.map((c) => c.id),
      "backup codes unchanged",
    );

    return { before };
  }

  it("public DELETE /accounts/:id returns 403 and writes nothing", async () => {
    const game = await createGame("Disabled Public Delete Game");
    const account = await createAccount(game.id);
    const before = await getRowCounts();

    const res = await fetch(`${publicBaseUrl}/accounts/${account.id}`, {
      method: "DELETE",
    });
    assert.strictEqual(res.status, 403);
    const data = (await res.json()) as { error: string; code: string };
    assert.strictEqual(data.error, "Account operations are currently disabled");
    assert.strictEqual(data.code, "ACCOUNT_OPS_DISABLED");

    const after = await getRowCounts();
    assert.strictEqual(after.accounts, before.accounts);
    assert.strictEqual(after.capacities, before.capacities);
    assert.strictEqual(after.backupCodes, before.backupCodes);
    assert.strictEqual(after.capacityCustomers, before.capacityCustomers);
  });

  it("internal handler returns 409 with zero writes when no capacity_customers history exists", async () => {
    const game = await createGame("Delete No History Game");
    const account = await createAccount(game.id);
    await assertAccountDeleteNotAvailable(account.id);
  });

  it("internal handler returns 409 with zero writes when active capacity_customers rows exist", async () => {
    const game = await createGame("Delete Active Assignment Game");
    const account = await createAccount(game.id);
    const accountId = account.id;
    const capacities = await getAccountCapacities(accountId);
    const order = await createOrder();
    await createAssignment(capacities[0].id, order.id, "active");

    await assertAccountDeleteNotAvailable(accountId);
  });

  it("internal handler returns 409 with zero writes when removed capacity_customers rows exist", async () => {
    const game = await createGame("Delete Removed Assignment Game");
    const account = await createAccount(game.id);
    const accountId = account.id;
    const capacities = await getAccountCapacities(accountId);
    const order = await createOrder();
    await createAssignment(capacities[0].id, order.id, "removed");

    await assertAccountDeleteNotAvailable(accountId);
  });

  it("internal handler returns 409 with zero writes when cancelled capacity_customers rows exist", async () => {
    const game = await createGame("Delete Cancelled Assignment Game");
    const account = await createAccount(game.id);
    const accountId = account.id;
    const capacities = await getAccountCapacities(accountId);
    const order = await createOrder();
    await createAssignment(capacities[0].id, order.id, "cancelled");

    await assertAccountDeleteNotAvailable(accountId);
  });

  it("internal handler returns 409 with zero writes when soft-deleted capacity_customers rows exist", async () => {
    const game = await createGame("Delete Soft Deleted Assignment Game");
    const account = await createAccount(game.id);
    const accountId = account.id;
    const capacities = await getAccountCapacities(accountId);
    const order = await createOrder();
    await createAssignment(capacities[0].id, order.id, "active", new Date());

    await assertAccountDeleteNotAvailable(accountId);
  });

  it("assignment on any capacity of the Account returns 409 with zero writes", async () => {
    const game = await createGame("Delete Multi Capacity Assignment Game", "PS4_AND_PS5");
    const account = await createAccount(game.id);
    const accountId = account.id;
    const capacities = await getAccountCapacities(accountId);
    assert.ok(capacities.length > 1, "account has multiple capacities");
    const lastCapacity = capacities[capacities.length - 1];
    const order = await createOrder();
    await createAssignment(lastCapacity.id, order.id, "active");

    await assertAccountDeleteNotAvailable(accountId);
  });

  it("invalid UUID returns HTTP 400", async () => {
    const res = await fetch(`http://localhost:${testPort}/accounts/not-a-uuid`, {
      method: "DELETE",
    });
    assert.strictEqual(res.status, 400);
  });

  it("missing Account returns HTTP 404", async () => {
    const res = await fetch(
      `http://localhost:${testPort}/accounts/550e8400-e29b-41d4-a716-446655440000`,
      { method: "DELETE" },
    );
    assert.strictEqual(res.status, 404);
    const data = (await res.json()) as { code: string };
    assert.strictEqual(data.code, "ACCOUNT_NOT_FOUND");
  });

  it("already soft-deleted Account returns HTTP 404", async () => {
    const game = await createGame("Delete Soft Deleted Account Game");
    const account = await createAccount(game.id);
    const accountId = account.id;
    await db.db
      .update(db.accountsTable)
      .set({ deletedAt: new Date() })
      .where(eq(db.accountsTable.id, accountId));

    const res = await fetch(deleteUrl(accountId), { method: "DELETE" });
    assert.strictEqual(res.status, 404);
    const data = (await res.json()) as { code: string };
    assert.strictEqual(data.code, "ACCOUNT_NOT_FOUND");
  });

  it("unexpected handler error returns 500 INTERNAL_ERROR and hides details", async () => {
    const app = express();
    app.use(express.json());
    app.delete("/accounts/:id", () => {
      throw new Error("secret database password: xyzzy-stack-trace");
    });
    app.use(errorHandler);
    const port = await getFreePort();
    const server = app.listen(port);
    try {
      const game = await createGame("Delete Unexpected Error Game");
      const account = await createAccount(game.id);
      const res = await fetch(`http://localhost:${port}/accounts/${account.id}`, {
        method: "DELETE",
      });
      assert.strictEqual(res.status, 500);
      const data = (await res.json()) as { error: string; code: string };
      assert.strictEqual(data.error, "Internal server error");
      assert.strictEqual(data.code, "INTERNAL_ERROR");
      const body = JSON.stringify(data).toLowerCase();
      assert.ok(!body.includes("secret"), "response leaks secret detail");
      assert.ok(!body.includes("password"), "response leaks password detail");
      assert.ok(!body.includes("xyzzy"), "response leaks stack marker");
      assert.ok(!body.includes("stack"), "response leaks stack detail");
      assert.ok(!body.includes("database"), "response leaks database detail");
    } finally {
      server.close();
    }
  });

  it("unrelated Games and Accounts remain unchanged after a delete attempt", async () => {
    const gameA = await createGame("Delete Unrelated Game A");
    const accountA = await createAccount(gameA.id);
    const gameB = await createGame("Delete Unrelated Game B");
    const accountB = await createAccount(gameB.id);

    const res = await fetch(deleteUrl(accountA.id), { method: "DELETE" });
    assert.strictEqual(res.status, 409);

    const remainingA = await db.db
      .select()
      .from(db.accountsTable)
      .where(eq(db.accountsTable.id, accountA.id))
      .limit(1);
    assert.strictEqual(remainingA.length, 1, "account A unchanged");

    const remainingB = await db.db
      .select()
      .from(db.accountsTable)
      .where(eq(db.accountsTable.id, accountB.id))
      .limit(1);
    assert.strictEqual(remainingB.length, 1, "account B unchanged");

    const gameBRow = await db.db
      .select()
      .from(db.gamesTable)
      .where(eq(db.gamesTable.id, gameB.id))
      .limit(1);
    assert.strictEqual(gameBRow.length, 1, "game B unchanged");
  });

  it("identifiers are not changed after a delete attempt", async () => {
    const game = await createGame("Delete Identifier Unchanged Game");
    const account = await createAccount(game.id);
    const accountId = account.id;
    const accountCode = account.accountCode;
    const displayNumber = account.displayNumber;
    const accountNumberSeq = account.accountNumberSeq;

    await assertAccountDeleteNotAvailable(accountId);

    const [row] = await db.db
      .select()
      .from(db.accountsTable)
      .where(eq(db.accountsTable.id, accountId))
      .limit(1);
    assert.ok(row, "account still exists");
    assert.strictEqual(row.accountCode, accountCode, "accountCode changed");
    assert.strictEqual(row.displayNumber, displayNumber, "displayNumber changed");
    assert.strictEqual(row.accountNumberSeq, accountNumberSeq, "accountNumberSeq changed");
  });
});

function assertNoSecrets(body: string): void {
  const lower = body.toLowerCase();
  const patterns = [
    "encrypted",
    "ciphertext",
    "hash",
    "password",
    "backup",
    "secret",
    "psn_email",
    "email_password",
    "family_management",
  ];
  for (const pattern of patterns) {
    assert.ok(
      !lower.includes(pattern),
      `response body leaks a secret/encrypted/hash value (pattern: ${pattern})`,
    );
  }
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}
