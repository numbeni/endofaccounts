/**
 * PS-03D5-6A — Safe API Error Parser
 *
 * Reads structured errors from error.data and error.status.
 * Never exposes raw messages, URLs, HTTP details, SQL, passwords,
 * or backup codes to the user.
 *
 * DEFECT GUARD: reads from error.data, NOT error.response.
 * DEFECT GUARD: checks data.code === "ACCOUNT_OPS_DISABLED", NOT Error.message.
 */

/** Safe Persian display labels for duplicate field names. */
export const DUPLICATE_FIELD_LABELS: Record<string, string> = {
  psnEmail: "ایمیل PSN",
  familyManagementEmail: "ایمیل مدیریت خانواده",
  onlineId: "Online ID",
};

/** Approved Persian message when Account operations are runtime-disabled. */
export const PERSIAN_DISABLED_MSG = "عملیات مدیریت اکانت‌ها فعلاً فعال نیست";

/** Approved Persian generic error message. */
export const PERSIAN_GENERIC_MSG =
  "عملیات با خطا مواجه شد. لطفاً دوباره تلاش کنید";

export type ParsedMutationError =
  | { kind: "duplicate_warning"; duplicateFields: string[] }
  | { kind: "ops_disabled" }
  | { kind: "generic" };

/**
 * Parse a mutation error into a typed discriminated union.
 *
 * Reads from error.data (the real ApiError field, not error.response).
 * Reads data.code to detect DUPLICATE_WARNING and ACCOUNT_OPS_DISABLED
 * (not Error.message which varies by runtime).
 *
 * Returns { kind: "generic" } for any unknown or malformed error.
 */
export function parseMutationError(error: unknown): ParsedMutationError {
  if (!error || typeof error !== "object") return { kind: "generic" };

  // Read from error.data — the authoritative structured payload on ApiError.
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== "object") return { kind: "generic" };

  const code = (data as { code?: unknown }).code;

  if (code === "DUPLICATE_WARNING") {
    const detail = (data as { detail?: { duplicateFields?: unknown } }).detail;
    const raw = detail?.duplicateFields;
    const duplicateFields = Array.isArray(raw)
      ? raw.filter((f): f is string => typeof f === "string")
      : [];
    return { kind: "duplicate_warning", duplicateFields };
  }

  if (code === "ACCOUNT_OPS_DISABLED") {
    return { kind: "ops_disabled" };
  }

  return { kind: "generic" };
}

/**
 * Return the safe Persian user-facing message for a non-duplicate error.
 * Callers handle duplicate_warning separately via DuplicateWarningDialog.
 */
export function safeMutationErrorMessage(
  parsed: Exclude<ParsedMutationError, { kind: "duplicate_warning" }>,
): string {
  if (parsed.kind === "ops_disabled") return PERSIAN_DISABLED_MSG;
  return PERSIAN_GENERIC_MSG;
}
