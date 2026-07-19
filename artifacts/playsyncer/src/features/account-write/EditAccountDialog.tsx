/**
 * PS-03D5-6A — Edit Account Dialog
 *
 * Edits an existing Account using only fields present in the safe Account DTO.
 *
 * Requirements:
 * - Never prefill Passwords.
 * - Unavailable email values (not in safe DTO) remain empty replacement fields.
 * - Empty Password or replacement email means no change.
 * - Submit changed fields only.
 * - Do NOT edit Backup Codes.
 * - Do NOT submit immutable identifiers (accountCode, displayNumber, gameId, …).
 * - Clear sensitive values after: success, close, external open=false,
 *   Account switch (accountId change), and reopen.
 * - Duplicate flow: same as CreateAccountDialog — second warning is generic.
 *
 * Safe DTO fields available for prefill: onlineId, birthDate.
 * All other editable fields (psnEmail, psnPassword, emailPassword,
 * familyManagementEmail) are not in the safe DTO and start empty.
 *
 * DEFECT GUARDS:
 * - Does NOT extend the safe DTO with invented fields.
 * - Does NOT require currentOverride.
 * - Does NOT import Delete hooks.
 * - Does NOT render raw error messages.
 */
import { useState, useEffect, useRef } from "react";
import { Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccountListItem } from "@workspace/api-client-react";
import { useUpdateAccount } from "@workspace/api-client-react";
import type { UpdateAccountRequest } from "@workspace/api-client-react";
import {
  parseMutationError,
  safeMutationErrorMessage,
  PERSIAN_GENERIC_MSG,
} from "./parseApiError";
import { isValidBirthDate } from "./validateBirthDate";
import { DuplicateWarningDialog } from "./DuplicateWarningDialog";

interface Props {
  open: boolean;
  /** Safe Account DTO — must not contain secrets. */
  account: AccountListItem | null;
  onSuccess: () => void;
  onClose: () => void;
}

type FieldErrors = Partial<
  Record<
    | "psnEmail"
    | "onlineId"
    | "birthDate"
    | "familyManagementEmail"
    | "noChanges"
    | "submit",
    string
  >
>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());

/** Clear only sensitive / non-DTO fields. Called on every close path and success. */
function emptySensitive(): Pick<
  ReturnType<typeof buildState>,
  "psnEmail" | "psnPassword" | "emailPassword" | "familyManagementEmail"
> {
  return {
    psnEmail: "",
    psnPassword: "",
    emailPassword: "",
    familyManagementEmail: "",
  };
}

function buildState(account: AccountListItem | null) {
  return {
    // From safe DTO — can be prefilled.
    onlineId: account?.onlineId ?? "",
    birthDate: account?.birthDate ?? "",
    // Not in safe DTO — always start empty.
    psnEmail: "",
    psnPassword: "",
    emailPassword: "",
    familyManagementEmail: "",
  };
}

export function EditAccountDialog({ open, account, onSuccess, onClose }: Props) {
  const [onlineId, setOnlineId] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [psnEmail, setPsnEmail] = useState("");
  const [psnPassword, setPsnPassword] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [familyManagementEmail, setFamilyManagementEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  // Duplicate flow
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [duplicateFields, setDuplicateFields] = useState<string[]>([]);
  const pendingPayloadRef = useRef<UpdateAccountRequest | null>(null);
  const confirmedOnceRef = useRef(false);

  const mutation = useUpdateAccount();

  const initState = (acc: AccountListItem | null) => {
    const s = buildState(acc);
    setOnlineId(s.onlineId);
    setBirthDate(s.birthDate);
    setPsnEmail(s.psnEmail);
    setPsnPassword(s.psnPassword);
    setEmailPassword(s.emailPassword);
    setFamilyManagementEmail(s.familyManagementEmail);
    setErrors({});
    setShowDuplicate(false);
    setDuplicateFields([]);
    pendingPayloadRef.current = null;
    confirmedOnceRef.current = false;
  };

  // Reset on open, reopen, and Account switch (account.id change).
  useEffect(() => {
    if (open) {
      initState(account);
    } else {
      // External close: clear selected action, previous error, and sensitive values.
      const s = emptySensitive();
      setPsnEmail(s.psnEmail);
      setPsnPassword(s.psnPassword);
      setEmailPassword(s.emailPassword);
      setFamilyManagementEmail(s.familyManagementEmail);
      setShowDuplicate(false);
      setDuplicateFields([]);
      pendingPayloadRef.current = null;
      confirmedOnceRef.current = false;
      setErrors({});
    }
  }, [open, account?.id]);

  // Keyboard close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showDuplicate) handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, showDuplicate]);

  const handleClose = () => {
    // Let the useEffect on open=false handle clearing.
    onClose();
  };

  /** Build payload with only changed fields. */
  const buildChangedPayload = (): UpdateAccountRequest => {
    const payload: UpdateAccountRequest = {};

    // Fields not in safe DTO — include if non-empty (user intent to change).
    // Exact empty string means "no change"; preserve non-empty values exactly.
    if (psnEmail.length > 0) payload.psnEmail = psnEmail;
    if (psnPassword.length > 0) payload.psnPassword = psnPassword;
    if (emailPassword.length > 0) payload.emailPassword = emailPassword;
    if (familyManagementEmail.length > 0) payload.familyManagementEmail = familyManagementEmail;

    // Fields in safe DTO — include if different from current value.
    const currentOnlineId = account?.onlineId ?? "";
    const currentBirthDate = account?.birthDate ?? "";
    if (onlineId.trim() !== currentOnlineId) {
      // If the user clears an existing value, it is a validation error — not a payload update.
      if (!onlineId.trim()) {
        // Caller should validate first; this branch is defensive.
      } else {
        payload.onlineId = onlineId.trim();
      }
    }
    if (birthDate.trim() !== currentBirthDate) {
      if (!birthDate.trim()) {
        // Defensive: empty DTO field should be rejected by validate(), never sent as undefined.
      } else {
        payload.birthDate = birthDate.trim();
      }
    }

    return payload;
  };

  const validate = (): boolean => {
    const errs: FieldErrors = {};
    if (psnEmail.trim() && !isValidEmail(psnEmail)) {
      errs.psnEmail = "فرمت ایمیل PSN صحیح نیست";
    }
    if (familyManagementEmail.trim() && !isValidEmail(familyManagementEmail)) {
      errs.familyManagementEmail = "فرمت Family Management Email صحیح نیست";
    }
    if (birthDate.trim() && !isValidBirthDate(birthDate)) {
      errs.birthDate = "فرمت باید YYYY-MM-DD باشد و تاریخ واقعی گریگوری باشد";
    }
    // If the user clears an existing safe-DTO value, block submission.
    if (account?.onlineId && !onlineId.trim()) {
      errs.onlineId = "Online ID نمی‌تواند خالی باشد";
    }
    if (account?.birthDate && !birthDate.trim()) {
      errs.birthDate = "تاریخ تولد نمی‌تواند خالی باشد";
    }
    const changed = buildChangedPayload();
    const hasChanges = Object.keys(changed).length > 0;
    if (!hasChanges && Object.keys(errs).length === 0) {
      errs.noChanges = "هیچ تغییری وارد نشده است";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account || mutation.isPending) return;
    if (!validate()) return;

    setErrors({});
    setShowDuplicate(false);
    confirmedOnceRef.current = false;

    const payload = buildChangedPayload();
    pendingPayloadRef.current = payload;

    try {
      await mutation.mutateAsync({ accountId: account.id, data: payload });
      // Success: parent closes the dialog (open=false triggers useEffect cleanup).
      handleClose();
      onSuccess();
    } catch (err) {
      const parsed = parseMutationError(err);
      if (parsed.kind === "duplicate_warning") {
        setDuplicateFields(parsed.duplicateFields);
        setShowDuplicate(true);
        return;
      }
      setErrors({ submit: safeMutationErrorMessage(parsed) });
    }
  };

  const handleDuplicateConfirm = async () => {
    if (!account || !pendingPayloadRef.current || mutation.isPending) return;

    confirmedOnceRef.current = true;
    setShowDuplicate(false);

    try {
      await mutation.mutateAsync({
        accountId: account.id,
        data: { ...pendingPayloadRef.current, confirmed: true },
      });
      // Success: parent closes the dialog (open=false triggers useEffect cleanup).
      handleClose();
      onSuccess();
    } catch (err) {
      const parsed = parseMutationError(err);
      // Second DUPLICATE_WARNING → no automatic retry loop.
      if (parsed.kind === "duplicate_warning") {
        setErrors({ submit: PERSIAN_GENERIC_MSG });
        return;
      }
      setErrors({ submit: safeMutationErrorMessage(parsed) });
    }
  };

  const handleDuplicateCancel = () => {
    setShowDuplicate(false);
    // Cancel sends no retry.
  };

  if (!open || !account) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[300] flex items-end justify-center sm:items-center sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-account-title"
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          onClick={handleClose}
        />

        <div className="relative z-[301] flex min-h-0 w-full flex-col overflow-hidden border border-border bg-card shadow-elevated max-h-[calc(100dvh-0.75rem)] rounded-t-3xl sm:w-[calc(100vw-2rem)] sm:max-w-lg sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl">
          {/* Mobile drag handle */}
          <div className="flex shrink-0 justify-center pt-2 sm:hidden">
            <div className="h-1 w-11 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Header */}
          <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-5 sm:py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-primary text-primary-foreground shadow-glow">
                <Pencil className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 id="edit-account-title" className="truncate text-sm font-semibold sm:text-base">
                  ویرایش اکانت
                </h2>
                <p className="text-[11px] text-muted-foreground font-mono" dir="ltr">
                  {account.displayNumber}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-accent transition-colors"
              aria-label="بستن"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y space-y-4 px-4 py-4 sm:space-y-5 sm:px-5 sm:py-5">
              {errors.submit && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {errors.submit}
                </div>
              )}
              {errors.noChanges && (
                <div className="rounded-xl border border-muted bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  {errors.noChanges}
                </div>
              )}

              {/* Account identifier — read-only display only */}
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                <p className="text-[10px] text-muted-foreground">شناسه اکانت (تغییرناپذیر)</p>
                <p className="mt-0.5 font-mono text-sm" dir="ltr">{account.accountCode}</p>
              </div>

              <FormField
                label="ایمیل PSN"
                hint="خالی بگذارید تا تغییر نکند"
                error={errors.psnEmail}
              >
                <input
                  type="email"
                  dir="ltr"
                  value={psnEmail}
                  onChange={(e) => {
                    setPsnEmail(e.target.value);
                    if (errors.psnEmail) setErrors((p) => ({ ...p, psnEmail: undefined }));
                  }}
                  placeholder="خالی = بدون تغییر"
                  autoComplete="off"
                  className={cn(
                    "w-full rounded-xl border bg-muted/40 px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 transition-all focus:ring-2 focus:ring-ring/30 sm:py-2.5",
                    errors.psnEmail ? "border-destructive focus:ring-destructive/30" : "border-border focus:border-primary/60",
                  )}
                />
              </FormField>

              <FormField label="رمز عبور PSN" hint="خالی بگذارید تا تغییر نکند">
                {/* Never prefilled */}
                <input
                  type="password"
                  dir="ltr"
                  value={psnPassword}
                  onChange={(e) => setPsnPassword(e.target.value)}
                  placeholder="خالی = بدون تغییر"
                  autoComplete="off"
                  className="w-full rounded-xl border border-border bg-muted/40 px-4 py-3 font-mono text-sm outline-none placeholder:text-muted-foreground/60 transition-all focus:border-primary/60 focus:ring-2 focus:ring-ring/30 sm:py-2.5"
                />
              </FormField>

              <FormField label="رمز ایمیل" hint="خالی بگذارید تا تغییر نکند">
                {/* Never prefilled */}
                <input
                  type="password"
                  dir="ltr"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  placeholder="خالی = بدون تغییر"
                  autoComplete="off"
                  className="w-full rounded-xl border border-border bg-muted/40 px-4 py-3 font-mono text-sm outline-none placeholder:text-muted-foreground/60 transition-all focus:border-primary/60 focus:ring-2 focus:ring-ring/30 sm:py-2.5"
                />
              </FormField>

              <FormField label="Online ID" error={errors.onlineId}>
                <input
                  type="text"
                  dir="ltr"
                  value={onlineId}
                  onChange={(e) => {
                    setOnlineId(e.target.value);
                    if (errors.onlineId) setErrors((p) => ({ ...p, onlineId: undefined }));
                  }}
                  placeholder="PSN username"
                  autoComplete="off"
                  className={cn(
                    "w-full rounded-xl border bg-muted/40 px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 transition-all focus:ring-2 focus:ring-ring/30 sm:py-2.5",
                    errors.onlineId ? "border-destructive focus:ring-destructive/30" : "border-border focus:border-primary/60",
                  )}
                />
              </FormField>

              <FormField
                label="تاریخ تولد"
                error={errors.birthDate}
                hint="فرمت: YYYY-MM-DD"
              >
                <input
                  type="text"
                  dir="ltr"
                  value={birthDate}
                  onChange={(e) => {
                    setBirthDate(e.target.value);
                    if (errors.birthDate) setErrors((p) => ({ ...p, birthDate: undefined }));
                  }}
                  placeholder="1990-08-27"
                  autoComplete="off"
                  className={cn(
                    "w-full rounded-xl border bg-muted/40 px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 transition-all focus:ring-2 focus:ring-ring/30 sm:py-2.5",
                    errors.birthDate ? "border-destructive focus:ring-destructive/30" : "border-border focus:border-primary/60",
                  )}
                />
              </FormField>

              <FormField
                label="Family Management Email"
                error={errors.familyManagementEmail}
                hint="خالی بگذارید تا تغییر نکند"
              >
                <input
                  type="email"
                  dir="ltr"
                  value={familyManagementEmail}
                  onChange={(e) => {
                    setFamilyManagementEmail(e.target.value);
                    if (errors.familyManagementEmail) setErrors((p) => ({ ...p, familyManagementEmail: undefined }));
                  }}
                  placeholder="خالی = بدون تغییر"
                  autoComplete="off"
                  className={cn(
                    "w-full rounded-xl border bg-muted/40 px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 transition-all focus:ring-2 focus:ring-ring/30 sm:py-2.5",
                    errors.familyManagementEmail ? "border-destructive focus:ring-destructive/30" : "border-border focus:border-primary/60",
                  )}
                />
              </FormField>

              <div className="rounded-xl border border-muted bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                Backup Codes در این مرحله قابل ویرایش نیستند.
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 z-10 flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-4 sm:pb-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={mutation.isPending}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 sm:py-2"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="inline-flex items-center justify-center rounded-xl gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-all hover:shadow-glow disabled:opacity-50 sm:px-5 sm:py-2"
              >
                {mutation.isPending ? "در حال ذخیره…" : "ذخیره تغییرات"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <DuplicateWarningDialog
        open={showDuplicate}
        duplicateFields={duplicateFields}
        onConfirm={handleDuplicateConfirm}
        onCancel={handleDuplicateCancel}
        isPending={mutation.isPending}
      />
    </>
  );
}

function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
