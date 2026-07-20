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

/**
 * Build a clean process environment so inherited shell/CI variables cannot
 * influence the runtime gate under test. Only values we explicitly set below
 * are passed to the server.
 */
function cleanProcessEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    LANG: process.env.LANG ?? "",
    LOG_LEVEL: process.env.LOG_LEVEL ?? "silent",
  };
}

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

async function createAccount(
  baseUrl: string,
  gameId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; onlineId: string }> {
  const res = await fetch(`${baseUrl}/games/${gameId}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...validRequest(), ...overrides }),
  });
  assert.strictEqual(res.status, 201);
  const data = (await res.json()) as { account: { id: string; onlineId: string } };
  return data.account;
}

async function startServerWithEnv(env: Record<string, string>) {
  const { databaseUrl, stop: stopPg } = await startTestPg();

  execSync("pnpm run build", {
    cwd: path.resolve(__dirname, "..", ".."),
    env: {
      ...cleanProcessEnv(),
      PORT: "8080",
      BASE_PATH: "/api-server",
      DATABASE_URL: databaseUrl,
      PLAYSYNCER_ACCOUNT_MASTER_KEY: TEST_MASTER_KEY,
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

  return { baseUrl, databaseUrl, stop: async () => {
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

async function getAccountOnlineId(
  databaseUrl: string,
  accountId: string,
): Promise<string> {
  const output = execSync(
    `psql "${databaseUrl}" -t -c "SELECT online_id FROM accounts WHERE id = '${accountId}';"`,
    { encoding: "utf-8" },
  );
  return output.trim();
}

async function seedAccount(databaseUrl: string, gameId: string): Promise<string> {
  const output = execSync(
    `psql "${databaseUrl}" -c "INSERT INTO accounts (game_id, account_code, account_number_prefix, account_number_seq, display_number, psn_email_encrypted, psn_email_lookup_hash, psn_password_encrypted, psn_password_lookup_hash, email_password_encrypted_v2, email_password_lookup_hash, family_management_email_encrypted_v2, family_management_email_lookup_hash, online_id, birth_date) VALUES ('${gameId}', 'ACC-SEED-001', 'SEED', 1, 'SEED-001', 'enc', 'hash', 'enc', 'hash', 'enc', 'hash', 'enc', 'hash', 'SeedOnlineId', '1990-01-01') RETURNING id;"`,
    { encoding: "utf-8" },
  );
  const match = output.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/,
  );
  assert.ok(match, "seed account returned a valid id");
  return match![1]!;
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
    let accountId: string;

    before(async () => {
      const ctx = await startServerWithEnv(env);
      baseUrl = ctx.baseUrl;
      stop = ctx.stop;
      databaseUrl = ctx.databaseUrl;
      gameId = await createGame(baseUrl);
      accountId = await seedAccount(databaseUrl, gameId);
    });

    after(async () => {
      await stop();
    });

    it("POST /games/:gameId/accounts returns 403 and writes nothing", async () => {
      const before = await countAccounts(databaseUrl);

      const res = await fetch(`${baseUrl}/games/${gameId}/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validRequest()),
      });
      assert.strictEqual(res.status, 403);
      const data = (await res.json()) as ErrorResponse;
      assert.strictEqual(data.error, "Account operations are not authorized");
      assert.strictEqual(data.code, "ACCOUNT_OPS_DISABLED");

      const after = await countAccounts(databaseUrl);
      assert.strictEqual(after, before);
    });

    it("PATCH /accounts/:id returns 403 and does not modify the persisted row", async () => {
      const before = await getAccountOnlineId(databaseUrl, accountId);
      assert.notStrictEqual(before, "PatchedOnlineId");

      const res = await fetch(`${baseUrl}/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlineId: "PatchedOnlineId" }),
      });
      assert.strictEqual(res.status, 403);
      const data = (await res.json()) as ErrorResponse;
      assert.strictEqual(data.error, "Account operations are not authorized");
      assert.strictEqual(data.code, "ACCOUNT_OPS_DISABLED");

      const after = await getAccountOnlineId(databaseUrl, accountId);
      assert.strictEqual(after, before);
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
  let databaseUrl: string;
  let gameId: string;
  let accountId: string;

  before(async () => {
    const ctx = await startServerWithEnv({
      NODE_ENV: "development",
      PLAYSYNCER_ACCOUNT_MUTATIONS_ENABLED: "true",
    });
    baseUrl = ctx.baseUrl;
    stop = ctx.stop;
    databaseUrl = ctx.databaseUrl;
    gameId = await createGame(baseUrl);
  });

  after(async () => {
    await stop();
  });

  it("POST /games/:gameId/accounts returns 201 and creates an Account", async () => {
    const account = await createAccount(baseUrl, gameId);
    accountId = account.id;

    const listRes = await fetch(`${baseUrl}/games/${gameId}/accounts`);
    const listData = (await listRes.json()) as { accounts: unknown[] };
    assert.strictEqual(listData.accounts.length, 1);
  });

  it("PATCH /accounts/:id returns 200 and persists the change after a fresh GET", async () => {
    assert.ok(accountId, "an account was created in the previous test");

    const patchRes = await fetch(`${baseUrl}/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlineId: "UpdatedGateOnlineId" }),
    });
    assert.strictEqual(patchRes.status, 200);
    const patchData = (await patchRes.json()) as {
      account: { id: string; onlineId: string };
    };
    assert.strictEqual(patchData.account.id, accountId);
    assert.strictEqual(patchData.account.onlineId, "UpdatedGateOnlineId");

    const getRes = await fetch(`${baseUrl}/accounts/${accountId}`);
    const getData = (await getRes.json()) as {
      account: { id: string; onlineId: string };
    };
    assert.strictEqual(getData.account.onlineId, "UpdatedGateOnlineId");

    const persisted = await getAccountOnlineId(databaseUrl, accountId);
    assert.strictEqual(persisted, "UpdatedGateOnlineId");
  });

  it("Status Override remains disabled even with the flag", async () => {
    assert.ok(accountId, "an account exists");
    const res = await fetch(`${baseUrl}/accounts/${accountId}/status-override`, {
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
    assert.ok(accountId, "an account exists");
    const res = await fetch(`${baseUrl}/accounts/${accountId}`, {
      method: "DELETE",
    });
    assert.strictEqual(res.status, 403);
    const data = (await res.json()) as ErrorResponse;
    assert.strictEqual(data.error, "Account operations are currently disabled");
    assert.strictEqual(data.code, "ACCOUNT_OPS_DISABLED");
  });
});
