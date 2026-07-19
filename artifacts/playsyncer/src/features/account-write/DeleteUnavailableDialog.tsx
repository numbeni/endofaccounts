/**
 * PS-03D5-6A — Delete Unavailable Dialog
 *
 * Informs the user that hard deletion is not available.
 * Directs them toward using INACTIVE status instead.
 *
 * CRITICAL SAFETY REQUIREMENTS:
 * - Does NOT import deleteAccount or useDeleteAccount.
 * - Sends ZERO DELETE requests.
 * - Does NOT remove the Account from local state.
 * - Never implies the Account can be deleted now.
 */

interface Props {
  open: boolean;
  onClose: () => void;
}

export function DeleteUnavailableDialog({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-unavailable-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-[401] w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
        <div className="p-5 sm:p-6">
          <h2
            id="delete-unavailable-title"
            className="text-base font-semibold text-foreground"
          >
            حذف در دسترس نیست
          </h2>

          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            {/* Approved Persian disabled message */}
            حذف دائمی اکانت فعلاً امکان‌پذیر نیست. برای خارج‌کردن اکانت از
            چرخه فروش، وضعیت آن را غیرفعال کنید.
          </p>

          <div className="mt-4 rounded-xl border border-muted bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            برای غیرفعال کردن اکانت، از گزینه «تغییر وضعیت» و سپس انتخاب
            «غیرفعال» استفاده کنید.
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            متوجه شدم
          </button>
        </div>
      </div>
    </div>
  );
}
