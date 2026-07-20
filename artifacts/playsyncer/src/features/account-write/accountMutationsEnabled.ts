/**
 * PS-03D5-7 — Account mutation runtime gate for the frontend.
 *
 * Add/Edit controls are rendered only when:
 * - Vite is running in development mode (`import.meta.env.DEV === true`)
 * - `VITE_PLAYSYNCER_ACCOUNT_MUTATIONS_ENABLED` is explicitly set to `"true"`
 *
 * In all other cases (production builds, missing flag, false flag, test mocks) the
 * active UI remains read-only and no Write controls are shown.
 *
 * This is a fail-closed gate: unknown/empty values keep mutations disabled.
 */
export function accountMutationsEnabled(): boolean {
  const isDev = import.meta.env.DEV === true;
  const flag = import.meta.env.VITE_PLAYSYNCER_ACCOUNT_MUTATIONS_ENABLED;
  return isDev && flag === "true";
}

/** Approved Persian explanation when the Game is INACTIVE. */
export const PERSIAN_INACTIVE_GAME_CREATE_DISABLED =
  "بازی غیرفعال است. برای افزودن اکانت، ابتدا بازی را فعال کنید.";
