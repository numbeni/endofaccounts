/**
 * PS-03D5-6A — Account Write Feature
 *
 * Isolated frontend for Account Create, Edit, Status Override, and
 * Delete Unavailable flows. Runtime-disabled: this feature MUST NOT be
 * imported by the active router, GameDetailPage, AccountCardReadOnly,
 * AccountDetailsReadOnly, or any mounted production component.
 *
 * Activation is deferred to a future phase after security review.
 * Do not add feature flags, hidden routes, or environment switches.
 */

export { CreateAccountDialog } from "./CreateAccountDialog";
export { EditAccountDialog } from "./EditAccountDialog";
export { DuplicateWarningDialog } from "./DuplicateWarningDialog";
export { StatusOverrideDialog } from "./StatusOverrideDialog";
export { DeleteUnavailableDialog } from "./DeleteUnavailableDialog";

// Utilities
export {
  parseMutationError,
  safeMutationErrorMessage,
  DUPLICATE_FIELD_LABELS,
  PERSIAN_DISABLED_MSG,
  PERSIAN_GENERIC_MSG,
} from "./parseApiError";
export type { ParsedMutationError } from "./parseApiError";
export { isValidBirthDate } from "./validateBirthDate";
