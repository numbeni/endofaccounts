/**
 * PS-03D5-7 — Sensitive value redaction for server-side logging.
 *
 * Unexpected errors during Account Create/Update must be logged without
 * plaintext passwords, emails, backup codes, request bodies, database parameter
 * arrays, encryption keys, or sensitive SQL details. Enough safe context is
 * retained for diagnosis, such as operation name and error category.
 */

const SENSITIVE_KEYS = new Set([
  "password",
  "psnPassword",
  "emailPassword",
  "psnEmail",
  "email",
  "familyManagementEmail",
  "backupCodes",
  "codeCiphertext",
  "psnEmailEncrypted",
  "psnPasswordEncrypted",
  "emailPasswordEncryptedV2",
  "familyManagementEmailEncryptedV2",
  "psnEmailLookupHash",
  "psnPasswordLookupHash",
  "emailPasswordLookupHash",
  "familyManagementEmailLookupHash",
  "PLAYSYNCER_ACCOUNT_MASTER_KEY",
  "encryptionKey",
  "secretKey",
  "apiKey",
  "body",
  "parameters",
  "params",
  "values",
  "query",
  "sql",
  "queryText",
  "statement",
  "constraint",
  "detail", // Postgres error detail often contains values
  "hint",
  "internalPosition",
  "internalQuery",
  "where",
  "schema",
  "table",
  "column",
  "dataType",
  // pino / http redaction
  "authorization",
  "cookie",
  "set-cookie",
]);

const SENSITIVE_SUBSTRINGS = [
  "password",
  "email",
  "backup",
  "ciphertext",
  "encrypted",
  "lookup_hash",
  "master_key",
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "FROM",
  "WHERE",
  "VALUES",
  "RETURNING",
  "$1",
  "$2",
];

/** Deep-clone and redact an object, replacing sensitive values with `[REDACTED]`. */
export function redactForLog(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return redactString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? "[REDACTED]" : undefined,
    };
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactForLog(val);
      }
    }
    return result;
  }

  return "[REDACTED]";
}

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  for (const candidate of SENSITIVE_KEYS) {
    if (lower.includes(candidate.toLowerCase())) return true;
  }
  return false;
}

function redactString(value: string): string {
  if (value.length === 0) return value;
  const lower = value.toLowerCase();
  for (const substring of SENSITIVE_SUBSTRINGS) {
    if (lower.includes(substring.toLowerCase())) {
      return "[REDACTED]";
    }
  }
  return value;
}
