/**
 * PS-03D5-6A — Tests: validateBirthDate
 *
 * Covers YYYY-MM-DD format check, real calendar validation,
 * impossible date rejection, and leap year support.
 *
 * DEFECT GUARD: does NOT rely only on Date.parse — verifies actual
 * calendar correctness (e.g. 2026-02-31 is rejected).
 */
import { describe, it, expect } from "vitest";
import { isValidBirthDate } from "../validateBirthDate";

describe("isValidBirthDate", () => {
  // ── Valid dates ──────────────────────────────────────────────────────────
  it("accepts a valid date 1990-08-27", () => {
    expect(isValidBirthDate("1990-08-27")).toBe(true);
  });

  it("accepts 2001-01-01 (January 1)", () => {
    expect(isValidBirthDate("2001-01-01")).toBe(true);
  });

  it("accepts 2000-12-31 (December 31)", () => {
    expect(isValidBirthDate("2000-12-31")).toBe(true);
  });

  it("accepts 1985-02-28 (February 28 on a non-leap year)", () => {
    expect(isValidBirthDate("1985-02-28")).toBe(true);
  });

  // ── Leap year support ────────────────────────────────────────────────────
  it("accepts 2024-02-29 (valid leap year)", () => {
    expect(isValidBirthDate("2024-02-29")).toBe(true);
  });

  it("accepts 2000-02-29 (2000 is a leap year)", () => {
    expect(isValidBirthDate("2000-02-29")).toBe(true);
  });

  // ── Impossible / impossible dates ────────────────────────────────────────
  it("rejects 2026-02-31 (February cannot have 31 days)", () => {
    expect(isValidBirthDate("2026-02-31")).toBe(false);
  });

  it("rejects 2026-02-29 (2026 is not a leap year)", () => {
    expect(isValidBirthDate("2026-02-29")).toBe(false);
  });

  it("rejects 1900-02-29 (1900 is not a leap year)", () => {
    expect(isValidBirthDate("1900-02-29")).toBe(false);
  });

  it("rejects 2026-04-31 (April has only 30 days)", () => {
    expect(isValidBirthDate("2026-04-31")).toBe(false);
  });

  it("rejects 2026-06-31 (June has only 30 days)", () => {
    expect(isValidBirthDate("2026-06-31")).toBe(false);
  });

  it("rejects 2026-01-00 (day 0 is invalid)", () => {
    expect(isValidBirthDate("2026-01-00")).toBe(false);
  });

  it("rejects 2026-13-01 (month 13 is invalid)", () => {
    expect(isValidBirthDate("2026-13-01")).toBe(false);
  });

  it("rejects 2026-00-15 (month 0 is invalid)", () => {
    expect(isValidBirthDate("2026-00-15")).toBe(false);
  });

  // ── Format enforcement ───────────────────────────────────────────────────
  it("rejects YYYY/MM/DD format (wrong separator)", () => {
    expect(isValidBirthDate("1990/08/27")).toBe(false);
  });

  it("rejects DD-MM-YYYY format", () => {
    expect(isValidBirthDate("27-08-1990")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidBirthDate("")).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    expect(isValidBirthDate("   ")).toBe(false);
  });

  it("rejects partial date 1990-08", () => {
    expect(isValidBirthDate("1990-08")).toBe(false);
  });

  it("rejects non-numeric characters 199X-08-27", () => {
    expect(isValidBirthDate("199X-08-27")).toBe(false);
  });

  it("rejects date with extra characters 1990-08-27T00:00:00", () => {
    expect(isValidBirthDate("1990-08-27T00:00:00")).toBe(false);
  });

  // ── Whitespace tolerance ─────────────────────────────────────────────────
  it("accepts '  1990-08-27  ' (trims leading/trailing whitespace)", () => {
    expect(isValidBirthDate("  1990-08-27  ")).toBe(true);
  });
});
