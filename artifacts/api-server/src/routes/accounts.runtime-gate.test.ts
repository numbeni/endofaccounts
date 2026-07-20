import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startTestPg, startApiServer } from "../lib/test-pg.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "..", "dist");

type ErrorResponse = { error: string; code?: string };

const TEST_MASTER_KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef",
  "utf8",
).toString("base64");

const validRequest = () => ({
  psnEmail: `gate-test-${Date.now()}@example.com`,
  psnPassword: "psn-secret",
  emailPassword: "email-secret",
  onlineId: `GateTest${Date.now()}`,
  birthDate: "1990-01-01",
  familyManagementEmail: `gate-family-${Date.now()}@example.com`,
  backupCodes: ["code1"],
});

async function createGame(baseUrl: string) {
  const res = await fetch(`${baseUrl}/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `Gate Test Game ${Date.now()}`,
      platform: "PS5_ONLY",
    }),
  });
  const data = (await res.json()) as { game: { id: string } };
  return data.game.id;
}

async function startServerWithEnv(env: Record<string, string>) {
  const { databaseUrl, stop: stopPg } = await startTestPg();

  execSync("pnpm run build", {
    cwd: path.resolve(__dirname, "..", ".."),
    env: {
      ...process.env,
      PORT: "8080",
      BASE_PATH: "/api-server",
    },
    stdio: "ignore",
  });

  const { baseUrl, stop: stopServer } = await startApiServer(
    databaseUrl,
    DIST_DIR,
    {
      ...env,
      PLAYSYNCER_ACCOUNT_MASTER_KEY: TEST_MASTER_KEY,
    },
  );

  return { baseUrl, stop: async () => {
    await stopServer();
    await stopPg();
  } };
}

async function countAccounts(databaseUrl: string): Promise<number> {
  const output = execSync(
    `psql "${databaseUrl}" -c "SELECT count(*)::int FROM accounts;"`,
    { encoding: "utf-8" },
  );
  const match = output.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

async function testDisabled(
  env: Record<string, string>,
  description: string,
): Promise<void> {
  describe(description, () => {
    let baseUrl: string;
    let stop: () => Promise<void>;
    let databaseUrl: string;
    let gameId: string;

    before(async () => {
      const ctx = await startServerWithEnv(env);
      baseUrl = ctx.baseUrl;
      stop = ctx.stop;
      // databaseUrl is not exposed by startServerWithEnv; rely on row count via fetch fallback.
      gameId = await createGame(baseUrl);
    });

    after(async () => {
      await stop();
    });

    it("POST /games/:gameId/accounts returns 403 and writes nothing", async () => {
      const listBefore = await fetch(`${baseUrl}/games/${gameId}/accounts`);
      const beforeData = (await listBefore.json()) as {
        accounts: unknown[];
      };
      const before = beforeData.accounts.length;

      const res = await fetch(`${baseUrl}/games/${gameId}/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validRequest()),
      });
      assert.strictEqual(res.status, 403);
      const data = (await res.json()) as ErrorResponse;
      assert.strictEqual(data.error, "Account operations are not authorized");
      assert.strictEqual(data.code, "ACCOUNT_OPS_DISABLED");

      const listAfter = await fetch(`${baseUrl}/games/${gameId}/accounts`);
      const afterData = (await listAfter.json()) as {
        accounts: unknown[];
      };
      assert.strictEqual(afterData.accounts.length, before);
    });

    it("PATCH /accounts/:id returns 403 and writes nothing", async () => {
      const res = await fetch(`${baseUrl}/accounts/${gameId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlineId: "new-id" }),
      });
      assert.strictEqual(res.status, 403);
      const data = (await res.json()) as ErrorResponse;
      assert.strictEqual(data.error, "Account operations are not authorized");
      assert.strictEqual(data.code, "ACCOUNT_OPS_DISABLED");
    });
  });
}

await testDisabled(
  { NODE_ENV: "development" },
  "Account mutation routes are disabled when flag is missing",
);

await testDisabled(
  { NODE_ENV: "development", PLAYSYNCER_ACCOUNT_MUTATIONS_ENABLED: "false" },
  "Account mutation routes are disabled when flag is false",
);

await testDisabled(
  {
    NODE_ENV: "production",
    PLAYSYNCER_ACCOUNT_MUTATIONS_ENABLED: "true",
    REPLIT_ENVIRONMENT: "production",
  },
  "Account mutation routes remain disabled in production even when flag is true",
);

describe("Account mutation routes are enabled in development with explicit true flag", () => {
  let baseUrl: string;
  let stop: () => Promise<void>;
  let gameId: string;

  before(async () => {
    const ctx = await startServerWithEnv({
      NODE_ENV: "development",
      PLAYSYNCER_ACCOUNT_MUTATIONS_ENABLED: "true",
    });
    baseUrl = ctx.baseUrl;
    stop = ctx.stop;
    gameId = await createGame(baseUrl);
  });

  after(async () => {
    await stop();
  });

  it("POST /games/:gameId/accounts returns 201 and creates an Account", async () => {
    const res = await fetch(`${baseUrl}/games/${gameId}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest()),
    });
    assert.strictEqual(res.status, 201);
    const data = (await res.json()) as { account: { id: string } };
    assert.ok(data.account.id);

    const listRes = await fetch(`${baseUrl}/games/${gameId}/accounts`);
    const listData = (await listRes.json()) as { accounts: unknown[] };
    assert.strictEqual(listData.accounts.length, 1);
  });

  it("Status Override remains disabled even with the flag", async () => {
    const res = await fetch(`${baseUrl}/accounts/${gameId}/status-override`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusOverride: "SOLD" }),
    });
    assert.strictEqual(res.status, 403);
    const data = (await res.json()) as ErrorResponse;
    assert.strictEqual(data.error, "Account operations are not authorized");
    assert.strictEqual(data.code, "ACCOUNT_OPS_DISABLED");
  });

  it("Delete remains disabled even with the flag", async () => {
    const res = await fetch(`${baseUrl}/accounts/${gameId}`, {
      method: "DELETE",
    });
    assert.strictEqual(res.status, 403);
    const data = (await res.json()) as ErrorResponse;
    assert.strictEqual(data.error, "Account operations are currently disabled");
    assert.strictEqual(data.code, "ACCOUNT_OPS_DISABLED");
  });
});
