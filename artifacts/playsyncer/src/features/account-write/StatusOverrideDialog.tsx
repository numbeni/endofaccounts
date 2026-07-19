/**
 * PS-03D5-6A — Status Override Dialog
 *
 * Allows setting a manual status override on an Account.
 *
 * Requirements:
 * - Offers only: SOLD, INACTIVE, Clear Override (null).
 * - Does NOT offer AVAILABLE or PARTIALLY_SOLD.
 * - Clear Override sends null (not an empty string or undefined).
 * - Does NOT require currentOverride — the safe DTO does not expose it.
 * - Does NOT claim whether the current status is manually overridden.
 */
import { useState } from "react";
import { useSetAccountStatusOverride } from "@workspace/api-client-react";
import { parseMutationError, safeMutationErrorMessage } from "./parseApiError";

interface Props {
  open: boolean;
  accountId: string;
  onSuccess: () => void;
  onClose: () => void;
}

type OverrideChoice = "SOLD" | "INACTIVE" | null;

const OVERRIDE_OPTIONS: { value: OverrideChoice; label: string; description: string }[] = [
  {
    value: "SOLD",
    label: "فروخته‌شده",
    description: "اکانت را به‌عنوان فروخته‌شده علامت‌گذاری می‌کند",
  },
  {
    value: "INACTIVE",
    label: "غیرفعال",
    description: "اکانت را از چرخه فروش خارج می‌کند",
  },
  {
    value: null,
    label: "پاک‌کردن وضعیت دستی",
    description: "وضعیت مبتنی بر ظرفیت را بازیابی می‌کند",
  },
];

export function StatusOverrideDialog({ open, accountId, onSuccess, onClose }: Props) {
  const [selected, setSelected] = useState<OverrideChoice | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useSetAccountStatusOverride();

  const handleClose = () => {
    setSelected(undefined);
    setErrorMsg(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (selected === undefined) {
      setErrorMsg("لطفاً یک گزینه انتخاب کنید");
      return;
    }
    setErrorMsg(null);
    try {
      await mutation.mutateAsync({
        accountId,
        data: { statusOverride: selected },
      });
      setSelected(undefined);
      onSuccess();
    } catch (err) {
      const parsed = parseMutationError(err);
      // StatusOverride does not produce DUPLICATE_WARNING; treat all as generic or disabled.
      if (parsed.kind === "duplicate_warning") {
        setErrorMsg(safeMutationErrorMessage({ kind: "generic" }));
      } else {
        setErrorMsg(safeMutationErrorMessage(parsed));
      }
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-override-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="relative z-[401] w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
        <div className="p-5 sm:p-6">
          <h2
            id="status-override-title"
            className="text-base font-semibold text-foreground"
          >
            تغییر وضعیت اکانت
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            یک وضعیت دستی انتخاب کنید یا وضعیت موجود را پاک کنید.
          </p>

          <div className="mt-4 space-y-2">
            {OVERRIDE_OPTIONS.map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => {
                  setSelected(opt.value);
                  setErrorMsg(null);
                }}
                className={[
                  "w-full rounded-xl border px-4 py-3 text-right transition-all",
                  selected === opt.value
                    ? opt.value === "SOLD"
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : opt.value === "INACTIVE"
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-success/40 bg-success/10 text-success"
                    : "border-border bg-muted/40 text-foreground hover:bg-accent",
                ].join(" ")}
              >
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {opt.description}
                </div>
              </button>
            ))}
          </div>

          {errorMsg && (
            <p className="mt-3 text-sm text-destructive">{errorMsg}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={mutation.isPending}
            className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={mutation.isPending || selected === undefined}
            className="inline-flex items-center justify-center rounded-xl gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition-all hover:shadow-glow disabled:opacity-50"
          >
            {mutation.isPending ? "در حال ذخیره…" : "اعمال"}
          </button>
        </div>
      </div>
    </div>
  );
}
