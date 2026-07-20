import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import express, { type Express } from "express";
import net from "node:net";
import { eq, sql } from "drizzle-orm";
import { startTestPg } from "../lib/test-pg.ts";
import { errorHandler } from "../middlewares/error-handler.ts";
import { p } from "../lib/req-param.ts";

const TEST_MASTER_KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef",
  "utf8",
).toString("base64");

let createAccountHandler: typeof import("./accounts.ts")["createAccountHandler"];
let updateAccountHandler: typeof import("./accounts.ts")["updateAccountHandler"];

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `${Date.now()}_${idCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    psnEmail: `case-test-${nextId()}@example.com`,
    psnPassword: "psn-secret",
    emailPassword: "email-secret",
    onlineId: `CaseId${nextId()}`,
    birthDate: "1990-01-01",
    familyManagementEmail: `case-family-${nextId()}@example.com`,
    backupCodes: ["code1"],
    ...overrides,
  };
}

function buildTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.post("/games/:gameId/accounts", (req, res, next) => {
    const gameId = p(req.params["gameId"]);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId)) {
      res.status(400).json({ error: "gameId must be a valid UUID", code: "VALIDATION_ERROR" });
      return;
    }
    createAccountHandler(req, res, next);
  });
  app.patch("/accounts/:id", (req, res, next) => {
    const id = p(req.params["id"]);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      res.status(400).json({ error: "id must be a valid UUID", code: "VALIDATION_ERROR" });
      return;
    }
    updateAccountHandler(req, res, next);
  });
  app.use(errorHandler);
  return app;
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

describe("Online ID case preservation and duplicate detection", { concurrency: 1 }, () => {
  let databaseUrl: string;
  let stopPg: () => Promise<void>;
  let db: typeof import("@workspace/db");
  let testApp: Express;
  let testServer: ReturnType<typeof express.application.listen>;
  let testPort: number;

  before(async () => {
    const { databaseUrl: dbUrl, stop: stopPgFn } = await startTestPg();
    databaseUrl = dbUrl;
    stopPg = stopPgFn;

    process.env.DATABASE_URL = databaseUrl;
    process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY = TEST_MASTER_KEY;

    db = await import("@workspace/db");

    // Load modules that depend on @workspace/db only after the disposable test
    // database URL is set, so the production DB connection architecture is not
    // modified to accommodate tests.
    const accountsModule = await import("./accounts.ts");
    createAccountHandler = accountsModule.createAccountHandler;
    updateAccountHandler = accountsModule.updateAccountHandler;

    testApp = buildTestApp();
    testPort = await getFreePort();
    testServer = testApp.listen(testPort);
  });

  after(async () => {
    testServer.close();
    await db.pool.end();
    await stopPg();
  });

  function testUrl(gameId: string) {
    return `http://localhost:${testPort}/games/${gameId}/accounts`;
  }

  function updateUrl(accountId: string) {
    return `http://localhost:${testPort}/accounts/${accountId}`;
  }

  async function createGame(
    title: string,
    platform: "PS5_ONLY" | "PS4_AND_PS5" | "PS4_ONLY" = "PS5_ONLY",
    status: "ACTIVE" | "INACTIVE" = "ACTIVE",
  ) {
    const uniqueTitle = `${title} ${nextId()}`;
    const [game] = await db.db
      .insert(db.gamesTable)
      .values({
        title: uniqueTitle,
        titleNormalized: uniqueTitle.toLowerCase().trim(),
        platform,
        status,
      })
      .returning();
    return game;
  }

  it("stores Online ID with its entered casing after trimming", async () => {
    const game = await createGame("Case Preserve Game");
    const res = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createRequest({ onlineId: "  MyCoolId  " })),
    });
    assert.strictEqual(res.status, 201);
    const data = (await res.json()) as { account: { id: string; onlineId: string } };
    assert.strictEqual(data.account.onlineId, "MyCoolId");

    const [row] = await db.db
      .select({ onlineId: db.accountsTable.onlineId })
      .from(db.accountsTable)
      .where(eq(db.accountsTable.id, data.account.id));
    assert.strictEqual(row?.onlineId, "MyCoolId");
  });

  it("detects duplicate Online IDs case-insensitively and performs no writes", async () => {
    const game = await createGame("Case Duplicate Game");
    const first = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createRequest({ onlineId: "MixedCaseId" })),
    });
    assert.strictEqual(first.status, 201);

    const before = await db.db
      .select({ count: sql`count(*)::int` })
      .from(db.accountsTable);
    const beforeCount = (before[0] as { count: number }).count;

    const second = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createRequest({ onlineId: "mixedcaseid" })),
    });
    assert.strictEqual(second.status, 409);
    const data = (await second.json()) as {
      code: string;
      detail: { duplicateFields: string[] };
    };
    assert.strictEqual(data.code, "DUPLICATE_WARNING");
    assert.ok(data.detail.duplicateFields.includes("onlineId"));

    const after = await db.db
      .select({ count: sql`count(*)::int` })
      .from(db.accountsTable);
    const afterCount = (after[0] as { count: number }).count;
    assert.strictEqual(afterCount, beforeCount);
  });

  it("allows a case-only edit to update the displayed casing", async () => {
    const game = await createGame("Case Edit Game");
    const createRes = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createRequest({ onlineId: "OriginalCase" })),
    });
    assert.strictEqual(createRes.status, 201);
    const created = (await createRes.json()) as { account: { id: string } };

    const updateRes = await fetch(updateUrl(created.account.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlineId: "originalcase" }),
    });
    assert.strictEqual(updateRes.status, 200);
    const updated = (await updateRes.json()) as { account: { onlineId: string } };
    assert.strictEqual(updated.account.onlineId, "originalcase");

    const [row] = await db.db
      .select({ onlineId: db.accountsTable.onlineId })
      .from(db.accountsTable)
      .where(eq(db.accountsTable.id, created.account.id));
    assert.strictEqual(row?.onlineId, "originalcase");
  });

  it("does not treat the same Account as its own duplicate during case-only edit", async () => {
    const game = await createGame("Same Account Case Game");
    const createRes = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createRequest({ onlineId: "SameAccount" })),
    });
    assert.strictEqual(createRes.status, 201);
    const created = (await createRes.json()) as { account: { id: string } };

    const updateRes = await fetch(updateUrl(created.account.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlineId: "sameaccount" }),
    });
    assert.strictEqual(updateRes.status, 200);
  });

  it("detects a case-variant duplicate from another Account during update", async () => {
    const game = await createGame("Update Case Conflict Game");
    const first = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createRequest({ onlineId: "ConflictId" })),
    });
    assert.strictEqual(first.status, 201);
    const firstData = (await first.json()) as { account: { id: string } };

    const second = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createRequest({ onlineId: "OtherCaseId" })),
    });
    assert.strictEqual(second.status, 201);
    const secondData = (await second.json()) as { account: { id: string } };

    const updateRes = await fetch(updateUrl(secondData.account.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlineId: "conflictid" }),
    });
    assert.strictEqual(updateRes.status, 409);
    const data = (await updateRes.json()) as {
      code: string;
      detail: { duplicateFields: string[] };
    };
    assert.strictEqual(data.code, "DUPLICATE_WARNING");
    assert.ok(data.detail.duplicateFields.includes("onlineId"));
  });
});
