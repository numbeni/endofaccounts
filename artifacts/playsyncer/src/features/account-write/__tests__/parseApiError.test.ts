/**
 * PS-03D5-6A — Tests: parseApiError
 *
 * Verifies error parsing from real ApiError.data shape (not Error.message).
 * Tests: DUPLICATE_WARNING detection, ACCOUNT_OPS_DISABLED detection,
 * generic fallback, safe message selection.
 */
import { describe, it, expect } from "vitest";
import {
  parseMutationError,
  safeMutationErrorMessage,
  PERSIAN_DISABLED_MSG,
  PERSIAN_GENERIC_MSG,
  DUPLICATE_FIELD_LABELS,
} from "../parseApiError";

/** Build a real ApiError-shaped object (error.data holds the payload). */
function makeApiError(data: unknown, status = 409): { data: unknown; status: number } {
  return { data, status };
}

describe("parseMutationError", () => {
  it("returns duplicate_warning when data.code === DUPLICATE_WARNING", () => {
    const err = makeApiError({
      code: "DUPLICATE_WARNING",
      detail: { duplicateFields: ["psnEmail", "onlineId"] },
    });
    const result = parseMutationError(err);
    expect(result.kind).toBe("duplicate_warning");
    if (result.kind === "duplicate_warning") {
      expect(result.duplicateFields).toEqual(["psnEmail", "onlineId"]);
    }
  });

  it("returns ops_disabled when data.code === ACCOUNT_OPS_DISABLED", () => {
    const err = makeApiError({ code: "ACCOUNT_OPS_DISABLED" });
    const result = parseMutationError(err);
    expect(result.kind).toBe("ops_disabled");
  });

  it("returns generic for unknown code", () => {
    const err = makeApiError({ code: "SOME_OTHER_ERROR" });
    expect(parseMutationError(err).kind).toBe("generic");
  });

  it("returns generic when data is null", () => {
    const err = makeApiError(null);
    expect(parseMutationError(err).kind).toBe("generic");
  });

  it("returns generic when error is not an object", () => {
    expect(parseMutationError("some string error").kind).toBe("generic");
    expect(parseMutationError(42).kind).toBe("generic");
    expect(parseMutationError(null).kind).toBe("generic");
    expect(parseMutationError(undefined).kind).toBe("generic");
  });

  it("returns generic when error has no .data field", () => {
    const err = { message: "ACCOUNT_OPS_DISABLED" }; // Error.message — must NOT match
    expect(parseMutationError(err).kind).toBe("generic");
  });

  it("does NOT detect ACCOUNT_OPS_DISABLED from Error.message (defect guard)", () => {
    const err = new Error("ACCOUNT_OPS_DISABLED");
    // Plain Error has no .data — must return generic
    expect(parseMutationError(err).kind).toBe("generic");
  });

  it("returns empty duplicateFields array when detail is missing", () => {
    const err = makeApiError({ code: "DUPLICATE_WARNING" });
    const result = parseMutationError(err);
    expect(result.kind).toBe("duplicate_warning");
    if (result.kind === "duplicate_warning") {
      expect(result.duplicateFields).toEqual([]);
    }
  });

  it("filters out non-string items from duplicateFields", () => {
    const err = makeApiError({
      code: "DUPLICATE_WARNING",
      detail: { duplicateFields: ["psnEmail", 42, null, "onlineId"] },
    });
    const result = parseMutationError(err);
    expect(result.kind).toBe("duplicate_warning");
    if (result.kind === "duplicate_warning") {
      expect(result.duplicateFields).toEqual(["psnEmail", "onlineId"]);
    }
  });

  it("reads from error.data (defect guard — not error.response)", () => {
    // Simulate the v4 defect: data on error.response instead of error.data
    const errWithResponseInstead = {
      response: {
        data: {
          code: "DUPLICATE_WARNING",
          detail: { duplicateFields: ["psnEmail"] },
        },
      },
      // No .data field
    };
    // Must return generic because .data is absent
    expect(parseMutationError(errWithResponseInstead).kind).toBe("generic");
  });
});

describe("safeMutationErrorMessage", () => {
  it("returns PERSIAN_DISABLED_MSG for ops_disabled", () => {
    expect(safeMutationErrorMessage({ kind: "ops_disabled" })).toBe(PERSIAN_DISABLED_MSG);
  });

  it("returns PERSIAN_GENERIC_MSG for generic", () => {
    expect(safeMutationErrorMessage({ kind: "generic" })).toBe(PERSIAN_GENERIC_MSG);
  });

  it("PERSIAN_DISABLED_MSG contains the approved text", () => {
    expect(PERSIAN_DISABLED_MSG).toContain("فعال نیست");
  });

  it("PERSIAN_GENERIC_MSG does not contain raw HTTP details or server text", () => {
    expect(PERSIAN_GENERIC_MSG).not.toMatch(/HTTP|http|status|fetch|Error/);
  });
});

describe("DUPLICATE_FIELD_LABELS", () => {
  it("maps psnEmail to safe Persian label", () => {
    expect(DUPLICATE_FIELD_LABELS["psnEmail"]).toBeTruthy();
    expect(DUPLICATE_FIELD_LABELS["psnEmail"]).not.toContain("@");
    expect(DUPLICATE_FIELD_LABELS["psnEmail"]).not.toContain("password");
  });

  it("maps familyManagementEmail to safe Persian label", () => {
    expect(DUPLICATE_FIELD_LABELS["familyManagementEmail"]).toBeTruthy();
  });

  it("maps onlineId to safe Persian label", () => {
    expect(DUPLICATE_FIELD_LABELS["onlineId"]).toBeTruthy();
  });
});
