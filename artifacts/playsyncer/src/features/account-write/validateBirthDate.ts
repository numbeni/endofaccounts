/**
 * PS-03D5-6A — Birth Date Validation
 *
 * Validates Gregorian dates in YYYY-MM-DD format.
 * Rejects impossible dates such as 2026-02-31.
 * Supports valid leap years (e.g. 2024-02-29).
 *
 * DEFECT GUARD: does NOT rely only on Date.parse.
 * Uses the Date constructor's calendar arithmetic to get the true
 * last day of each month, correctly handling leap years.
 */

const BIRTH_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns true when `value` is a valid Gregorian date in YYYY-MM-DD format.
 *
 * Validation steps:
 * 1. Pattern check — must match YYYY-MM-DD exactly.
 * 2. Month range check — month must be 01–12.
 * 3. Day range check — day must be 01..lastDayOfMonth, computed via the
 *    Date constructor (handles February and leap years correctly).
 */
export function isValidBirthDate(value: string): boolean {
  const trimmed = value.trim();
  if (!BIRTH_DATE_RE.test(trimmed)) return false;

  const [yearStr, monthStr, dayStr] = trimmed.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1-indexed (1 = January)
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) return false;
  if (day < 1) return false;

  // new Date(year, month, 0) gives the last day of month M (1-indexed):
  //   • new Date(2026, 2, 0) → Feb 28 2026  → lastDay = 28
  //   • new Date(2024, 2, 0) → Feb 29 2024  → lastDay = 29 (leap)
  //   • new Date(2026, 4, 0) → Mar 31 2026  → lastDay = 31
  // The second arg is the Date month in 0-indexed (0 = Jan), so passing
  // the 1-indexed month M directly gives us the last day of month M.
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  if (day > lastDayOfMonth) return false;

  return true;
}
