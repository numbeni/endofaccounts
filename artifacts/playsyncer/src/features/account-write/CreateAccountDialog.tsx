/**
 * PS-03D5-6A — Create Account Dialog
 *
 * Creates a new Account under a given Game.
 *
 * Requirements:
 * - gameId comes from parent context (prop), not editable.
 * - statusOverride is NOT available during Create.
 * - Identifiers (accountCode, displayNumber) are not editable.
 * - At least one non-empty Backup Code is required.
 * - Backup Code rows can be added and removed.
 * - Prevent duplicate submit while pending.
 * - Clear Passwords and Backup Codes after success and every close path.
 * - Duplicate flow: submit without confirmed → DUPLICATE_WARNING → dialog →
 *   confirm sends ONE retry with confirmed: true → a SECOND warning is
 *   treated as a generic error (no automatic retry loop).
 *
 * DEFECT GUARDS:
 * - error.data is read (not error.response).
 * - data.code checked (not Error.message) for ACCOUNT_OPS_DISABLED.
 * - Raw messages are never rendered.
 * - Delete hooks are not imported.
 */
import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, UserCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCreateAccount } from "@workspace/api-client-react";
import {
  parseMutationError,
  safeMutationErrorMessage,
  PERSIAN_GENERIC_MSG,
} from "./parseApiError";
import { isValidBirthDate } from "./validateBirthDate";
import { DuplicateWarningDialog } from "./DuplicateWarningDialog";

interface Props {
  open: boolean;
  gameId: string;
  onSuccess: () => void;
  onClose: () => void;
}

type FieldErrors = Partial<
  Record<
    | "psnEmail"
    | "psnPassword"
    | "emailPassword"
    | "onlineId"
    | "birthDate"
    | "familyManagementEmail"
    | "backupCodes"
    | "submit",
    string
  >
>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());

/** Clear only sensitive fields — called on success and every close path. */
function emptySensitive() {
  return {
    psnPassword: "",
    backupCodes: [""],
  };
}

export function CreateAccountDialog({ open, gameId, onSuccess, onClose }: Props) {
  const [psnEmail, setPsnEmail] = useState("");
  const [psnPassword, setPsnPassword] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [onlineId, setOnlineId] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [familyManagementEmail, setFamilyManagementEmail] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([""]);
  const [errors, setErrors] = useState<FieldErrors>({});

  // Duplicate flow state
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [duplicateFields, setDuplicateFields] = useState<string[]>([]);
  // pendingPayload holds the data to retry with confirmed: true
  const pendingPayloadRef = useRef<{
    psnEmail: string;
    psnPassword: string;
    emailPassword: string;
    onlineId: string;
    birthDate: string;
    familyManagementEmail: string;
    backupCodes: string[];
  } | null>(null);
  // Prevents automatic retry loop on second DUPLICATE_WARNING
  const confirmedOnceRef = useRef(false);

  const mutation = useCreateAccount();

  const clearSensitive = () => {
    const s = emptySensitive();
    setPsnPassword(s.psnPassword);
    setBackupCodes(s.backupCodes);
  };

  const resetAll = () => {
    setPsnEmail("");
    setPsnPassword("");
    setEmailPassword("");
    setOnlineId("");
    setBirthDate("");
    setFamilyManagementEmail("");
    setBackupCodes([""]);
    setErrors({});
    setShowDuplicate(false);
    setDuplicateFields([]);
    pendingPayloadRef.current = null;
    confirmedOnceRef.current = false;
  };

  useEffect(() => {
    if (open) {
      resetAll();
    }
  }, [open]);

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
    clearSensitive();
    resetAll();
    onClose();
  };

  const validate = (): boolean => {
    const errs: FieldErrors = {};
    if (!psnEmail.trim()) {
      errs.psnEmail = "ایمیل PSN الزامی است";
    } else if (!isValidEmail(psnEmail)) {
      errs.psnEmail = "فرمت ایمیل PSN صحیح نیست";
    }
    if (!psnPassword.trim()) errs.psnPassword = "رمز عبور PSN الزامی است";
    if (!emailPassword.trim()) errs.emailPassword = "رمز ایمیل الزامی است";
    if (!onlineId.trim()) errs.onlineId = "Online ID الزامی است";
    if (!birthDate.trim()) {
      errs.birthDate = "تاریخ تولد الزامی است";
    } else if (!isValidBirthDate(birthDate)) {
      errs.birthDate = "فرمت باید YYYY-MM-DD باشد و تاریخ واقعی گریگوری باشد (مثال: 1990-08-27)";
    }
    if (!familyManagementEmail.trim()) {
      errs.familyManagementEmail = "Family Management Email الزامی است";
    } else if (!isValidEmail(familyManagementEmail)) {
      errs.familyManagementEmail = "فرمت Family Management Email صحیح نیست";
    }
    const validCodes = backupCodes.filter((c) => c.trim().length > 0);
    if (validCodes.length === 0) {
      errs.backupCodes = "حداقل یک Backup Code الزامی است";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildPayload = () => ({
    psnEmail: psnEmail.trim(),
    psnPassword: psnPassword.trim(),
    emailPassword: emailPassword.trim(),
    onlineId: onlineId.trim(),
    birthDate: birthDate.trim(),
    familyManagementEmail: familyManagementEmail.trim(),
    backupCodes: backupCodes.filter((c) => c.trim().length > 0),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (mutation.isPending) return;

    setErrors({});
    setShowDuplicate(false);
    confirmedOnceRef.current = false;

    const payload = buildPayload();
    pendingPayloadRef.current = payload;

    try {
      await mutation.mutateAsync({ gameId, data: payload });
      clearSensitive();
      resetAll();
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
    const payload = pendingPayloadRef.current;
    if (!payload || mutation.isPending) return;

    confirmedOnceRef.current = true;
    setShowDuplicate(false);

    try {
      await mutation.mutateAsync({
        gameId,
        data: { ...payload, confirmed: true },
      });
      clearSensitive();
      resetAll();
      onSuccess();
    } catch (err) {
      const parsed = parseMutationError(err);
      // A second DUPLICATE_WARNING must NOT open the dialog again.
      // Show as generic error to prevent automatic retry loop.
      if (parsed.kind === "duplicate_warning") {
        setErrors({ submit: PERSIAN_GENERIC_MSG });
        return;
      }
      setErrors({ submit: safeMutationErrorMessage(parsed) });
    }
  };

  const handleDuplicateCancel = () => {
    setShowDuplicate(false);
    pendingPayloadRef.current = null;
    confirmedOnceRef.current = false;
    // No retry is sent.
  };

  const addBackupCode = () => {
    setBackupCodes((prev) => [...prev, ""]);
    if (errors.backupCodes) setErrors((p) => ({ ...p, backupCodes: undefined }));
  };

  const updateBackupCode = (index: number, value: string) => {
    setBackupCodes((prev) => prev.map((c, i) => (i === index ? value : c)));
    if (errors.backupCodes) setErrors((p) => ({ ...p, backupCodes: undefined }));
  };

  const removeBackupCode = (index: number) => {
    setBackupCodes((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length === 0 ? [""] : next;
    });
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[300] flex items-end justify-center sm:items-center sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-account-title"
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
                <UserCircle2 className="h-4 w-4" />
              </div>
              <h2 id="create-account-title" className="truncate text-sm font-semibold sm:text-base">
                افزودن اکانت جدید
              </h2>
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

              <FormField label="ایمیل PSN" required error={errors.psnEmail}>
                <input
                  type="email"
                  dir="ltr"
                  value={psnEmail}
                  onChange={(e) => {
                    setPsnEmail(e.target.value);
                    if (errors.psnEmail) setErrors((p) => ({ ...p, psnEmail: undefined }));
                  }}
                  placeholder="example@playstation.com"
                  autoComplete="off"
                  className={cn(
                    "w-full rounded-xl border bg-muted/40 px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 transition-all focus:ring-2 focus:ring-ring/30 sm:py-2.5",
                    errors.psnEmail ? "border-destructive focus:ring-destructive/30" : "border-border focus:border-primary/60",
                  )}
                />
              </FormField>

              <FormField label="رمز عبور PSN" required error={errors.psnPassword}>
                <input
                  type="text"
                  dir="ltr"
                  value={psnPassword}
                  onChange={(e) => {
                    setPsnPassword(e.target.value);
                    if (errors.psnPassword) setErrors((p) => ({ ...p, psnPassword: undefined }));
                  }}
                  placeholder="PlayStation password"
                  autoComplete="off"
                  className={cn(
                    "w-full rounded-xl border bg-muted/40 px-4 py-3 font-mono text-sm outline-none placeholder:text-muted-foreground/60 transition-all focus:ring-2 focus:ring-ring/30 sm:py-2.5",
                    errors.psnPassword ? "border-destructive focus:ring-destructive/30" : "border-border focus:border-primary/60",
                  )}
                />
              </FormField>

              <FormField label="رمز ایمیل" required error={errors.emailPassword}>
                <input
                  type="text"
                  dir="ltr"
                  value={emailPassword}
                  onChange={(e) => {
                    setEmailPassword(e.target.value);
                    if (errors.emailPassword) setErrors((p) => ({ ...p, emailPassword: undefined }));
                  }}
                  placeholder="Email password"
                  autoComplete="off"
                  className={cn(
                    "w-full rounded-xl border bg-muted/40 px-4 py-3 font-mono text-sm outline-none placeholder:text-muted-foreground/60 transition-all focus:ring-2 focus:ring-ring/30 sm:py-2.5",
                    errors.emailPassword ? "border-destructive focus:ring-destructive/30" : "border-border focus:border-primary/60",
                  )}
                />
              </FormField>

              <FormField label="Online ID" required error={errors.onlineId}>
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
                required
                error={errors.birthDate}
                hint="فرمت: YYYY-MM-DD (مثال: 1990-08-27)"
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

              <FormField label="Family Management Email" required error={errors.familyManagementEmail}>
                <input
                  type="email"
                  dir="ltr"
                  value={familyManagementEmail}
                  onChange={(e) => {
                    setFamilyManagementEmail(e.target.value);
                    if (errors.familyManagementEmail) setErrors((p) => ({ ...p, familyManagementEmail: undefined }));
                  }}
                  placeholder="family@email.com"
                  autoComplete="off"
                  className={cn(
                    "w-full rounded-xl border bg-muted/40 px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 transition-all focus:ring-2 focus:ring-ring/30 sm:py-2.5",
                    errors.familyManagementEmail ? "border-destructive focus:ring-destructive/30" : "border-border focus:border-primary/60",
                  )}
                />
              </FormField>

              {/* Backup Codes — rows can be added and removed */}
              <FormField
                label="Backup Codes"
                required
                error={errors.backupCodes}
                hint="کدهای پشتیبان ۲ مرحله‌ای — هر کد در یک ردیف"
              >
                <div className="space-y-2">
                  {backupCodes.map((code, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        dir="ltr"
                        value={code}
                        onChange={(e) => updateBackupCode(i, e.target.value)}
                        placeholder={`کد ${i + 1}`}
                        autoComplete="off"
                        className={cn(
                          "flex-1 rounded-xl border bg-muted/40 px-4 py-2.5 font-mono text-sm outline-none placeholder:text-muted-foreground/60 transition-all focus:ring-2 focus:ring-ring/30",
                          errors.backupCodes ? "border-destructive focus:ring-destructive/30" : "border-border focus:border-primary/60",
                        )}
                      />
                      {backupCodes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeBackupCode(i)}
                          aria-label={`حذف کد ${i + 1}`}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addBackupCode}
                    className="inline-flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    افزودن کد
                  </button>
                </div>
              </FormField>
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
                {mutation.isPending ? "در حال ذخیره…" : "افزودن اکانت"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Duplicate Warning Dialog — layered on top of the create dialog */}
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
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {label}
        {required && <span className="mr-1 text-destructive">*</span>}
      </label>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
