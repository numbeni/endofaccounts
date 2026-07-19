/**
 * PS-03D5-6A — Duplicate Warning Dialog
 *
 * Shown when the API returns code: "DUPLICATE_WARNING" during Create or Update.
 *
 * Safety requirements:
 * - Displays only safe Persian field labels (not values, not Account IDs).
 * - Cancel sends no retry request.
 * - Confirm signals one retry with confirmed: true (caller is responsible).
 * - A second DUPLICATE_WARNING response must NOT create an automatic retry loop
 *   (the caller sets this dialog open only on the first warning).
 */
import { DUPLICATE_FIELD_LABELS } from "./parseApiError";

interface Props {
  open: boolean;
  duplicateFields: string[];
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

export function DuplicateWarningDialog({
  open,
  duplicateFields,
  onConfirm,
  onCancel,
  isPending,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dup-warn-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onCancel}
      />

      <div className="relative z-[401] w-full max-w-sm overflow-hidden rounded-2xl border border-warning/30 bg-card shadow-elevated">
        <div className="p-5 sm:p-6">
          <h2
            id="dup-warn-title"
            className="text-base font-semibold text-foreground"
          >
            شباهت با اکانت موجود
          </h2>

          <p className="mt-2 text-sm text-muted-foreground">
            اطلاعات وارد شده با اکانت دیگری شباهت دارد. فیلدهای مشابه:
          </p>

          {duplicateFields.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-xl border border-border bg-muted/40 px-4 py-3">
              {duplicateFields.map((field) => (
                <li key={field} className="text-sm font-medium text-foreground">
                  {/* Safe: only display Persian label — never the field value or Account ID */}
                  {DUPLICATE_FIELD_LABELS[field] ?? field}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-sm text-muted-foreground">
            آیا مطمئن هستید که می‌خواهید با وجود این شباهت ادامه دهید؟
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-xl border border-warning/30 bg-warning/10 px-4 py-2 text-sm font-medium text-warning hover:bg-warning/20 transition-colors disabled:opacity-50"
          >
            {isPending ? "در حال ارسال…" : "تأیید و ادامه"}
          </button>
        </div>
      </div>
    </div>
  );
}
