import { describe, it } from "node:test";
import assert from "node:assert";
import { redactForLog } from "./sensitive-redaction.ts";

describe("redactForLog", () => {
  it("redacts plaintext passwords", () => {
    const result = redactForLog({ password: "super-secret" });
    assert.deepStrictEqual(result, { password: "[REDACTED]" });
  });

  it("redacts email addresses", () => {
    const result = redactForLog({ email: "operator@example.com" });
    assert.deepStrictEqual(result, { email: "[REDACTED]" });
  });

  it("redacts backup codes as a whole", () => {
    const result = redactForLog({ backupCodes: ["abc123", "def456"] });
    assert.deepStrictEqual(result, { backupCodes: "[REDACTED]" });
  });

  it("redacts encryption keys and master key", () => {
    const result = redactForLog({
      PLAYSYNCER_ACCOUNT_MASTER_KEY: "0123456789abcdef",
      encryptionKey: "secret-key",
    });
    assert.deepStrictEqual(result, {
      PLAYSYNCER_ACCOUNT_MASTER_KEY: "[REDACTED]",
      encryptionKey: "[REDACTED]",
    });
  });

  it("redacts SQL details from strings", () => {
    const result = redactForLog(
      "INSERT INTO accounts (psn_email) VALUES ($1) — duplicate key",
    );
    assert.strictEqual(result, "[REDACTED]");
  });

  it("redacts request bodies and parameter arrays", () => {
    const result = redactForLog({
      body: { psnEmail: "a@b.com", psnPassword: "pwd" },
      parameters: ["a@b.com", "pwd"],
    });
    assert.deepStrictEqual(result, {
      body: "[REDACTED]",
      parameters: "[REDACTED]",
    });
  });

  it("preserves safe primitive values", () => {
    const result = redactForLog({ count: 5, ok: true, label: "hello" });
    assert.deepStrictEqual(result, { count: 5, ok: true, label: "hello" });
  });

  it("redacts nested Error objects", () => {
    const err = new Error("failed for psnEmail operator@example.com");
    const result = redactForLog(err) as { message: string };
    assert.strictEqual(result.message, "[REDACTED]");
  });
});
