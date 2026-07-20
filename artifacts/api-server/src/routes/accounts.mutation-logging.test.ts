import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import {
  createAccountHandler,
  updateAccountHandler,
} from "./accounts.ts";
import { logger } from "../lib/logger.ts";
import { HttpError } from "../middlewares/error-handler.ts";

const SECRET_INJECTED_VALUE = "injected-super-secret-value-12345";

function buildLoggerSpy() {
  const calls: { args: unknown[]; msg: string }[] = [];
  const original = logger.error.bind(logger);
  logger.error = (...args: unknown[]) => {
    calls.push({ args: args as unknown[], msg: typeof args[0] === "string" ? args[0] : "" });
  };
  return {
    calls,
    restore: () => {
      logger.error = original;
    },
  };
}

function buildNext() {
  const calls: unknown[] = [];
  const next = (err: unknown) => {
    calls.push(err);
  };
  return { next, calls };
}

describe("Account mutation logging safety", () => {
  before(() => {
    // Use a value that is clearly secret but does not satisfy Base64 decoding,
    // so the service throws EncryptionError before any database writes.
    process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY = SECRET_INJECTED_VALUE;
  });

  after(() => {
    delete process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY;
  });

  it("Create logs only strict safe context and never the injected secret", async () => {
    const spy = buildLoggerSpy();
    const { next, calls } = buildNext();

    try {
      await createAccountHandler(
        {
          params: { gameId: "550e8400-e29b-41d4-a716-446655440000" },
          body: {
            psnEmail: "test@example.com",
            psnPassword: "psn-password",
            emailPassword: "email-password",
            onlineId: "TestOnlineId",
            birthDate: "1990-01-01",
            familyManagementEmail: "family@example.com",
            backupCodes: ["backup-code"],
          },
        } as never,
        {} as never,
        next,
      );
    } finally {
      spy.restore();
    }

    assert.strictEqual(calls.length, 1, "handler forwards exactly one error to next");
    const err = calls[0] as HttpError;
    assert.strictEqual(err.statusCode, 500);
    assert.strictEqual(err.code, "INTERNAL_ERROR");
    assert.strictEqual(err.message, "خطای داخلی رخ داد");

    assert.strictEqual(spy.calls.length, 1, "logger.error was called once");
    const logArg = spy.calls[0]!.args[0];
    const serialized = JSON.stringify(logArg).toLowerCase();
    assert.ok(
      !(logArg instanceof Error),
      "logger.error must not receive a raw Error object",
    );
    assert.ok(
      !serialized.includes(SECRET_INJECTED_VALUE.toLowerCase()),
      "log output must not contain the injected secret",
    );
    assert.ok(!serialized.includes("password"), "log output must not contain password");
    assert.ok(!serialized.includes("email"), "log output must not contain email");
    assert.ok(!serialized.includes("backup"), "log output must not contain backup code");
    assert.ok(!serialized.includes("secret"), "log output must not contain secret");
    assert.ok(!serialized.includes("stack"), "log output must not contain stack");
    assert.ok(
      !serialized.includes("message"),
      "log output must not contain raw error message",
    );

    assert.strictEqual((logArg as { operation: string }).operation, "create");
    assert.strictEqual((logArg as { code: string }).code, "ENCRYPTION_ERROR");
    assert.strictEqual(
      (logArg as { errorCategory: string }).errorCategory,
      "EncryptionError",
    );
  });

  it("Update logs only strict safe context and never the injected secret", async () => {
    const spy = buildLoggerSpy();
    const { next, calls } = buildNext();

    try {
      await updateAccountHandler(
        {
          params: { id: "550e8400-e29b-41d4-a716-446655440001" },
          body: {
            onlineId: "UpdatedOnlineId",
          },
        } as never,
        {} as never,
        next,
      );
    } finally {
      spy.restore();
    }

    assert.strictEqual(calls.length, 1, "handler forwards exactly one error to next");
    const err = calls[0] as HttpError;
    assert.strictEqual(err.statusCode, 500);
    assert.strictEqual(err.code, "INTERNAL_ERROR");
    assert.strictEqual(err.message, "خطای داخلی رخ داد");

    assert.strictEqual(spy.calls.length, 1, "logger.error was called once");
    const logArg = spy.calls[0]!.args[0];
    const serialized = JSON.stringify(logArg).toLowerCase();
    assert.ok(
      !(logArg instanceof Error),
      "logger.error must not receive a raw Error object",
    );
    assert.ok(
      !serialized.includes(SECRET_INJECTED_VALUE.toLowerCase()),
      "log output must not contain the injected secret",
    );
    assert.ok(!serialized.includes("password"), "log output must not contain password");
    assert.ok(!serialized.includes("email"), "log output must not contain email");
    assert.ok(!serialized.includes("backup"), "log output must not contain backup code");
    assert.ok(!serialized.includes("secret"), "log output must not contain secret");
    assert.ok(!serialized.includes("stack"), "log output must not contain stack");
    assert.ok(
      !serialized.includes("message"),
      "log output must not contain raw error message",
    );

    assert.strictEqual((logArg as { operation: string }).operation, "update");
    assert.strictEqual((logArg as { code: string }).code, "ENCRYPTION_ERROR");
    assert.strictEqual(
      (logArg as { errorCategory: string }).errorCategory,
      "EncryptionError",
    );
  });
});
