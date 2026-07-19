/**
 * PS-03D5-6A — Tests: StatusOverrideDialog
 *
 * Verifies:
 * - Offers only SOLD, INACTIVE, Clear Override (null).
 * - Does NOT offer AVAILABLE or PARTIALLY_SOLD.
 * - Clear Override sends null statusOverride payload.
 * - SOLD payload is { statusOverride: "SOLD" }.
 * - INACTIVE payload is { statusOverride: "INACTIVE" }.
 * - ACCOUNT_OPS_DISABLED shows safe message.
 * - Generic error shows safe message.
 * - Zero real network requests (fetch spy in setup.ts).
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { useSetAccountStatusOverride } from "@workspace/api-client-react";
import { render } from "@/test/render";
import { StatusOverrideDialog } from "../StatusOverrideDialog";
import { PERSIAN_DISABLED_MSG, PERSIAN_GENERIC_MSG } from "../parseApiError";

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<typeof import("@workspace/api-client-react")>(
    "@workspace/api-client-react",
  );
  return {
    ...actual,
    useSetAccountStatusOverride: vi.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeMutation(mutateAsync: (vars: any) => Promise<unknown>, isPending = false): any {
  return {
    mutateAsync,
    mutate: vi.fn(),
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    data: undefined,
    error: null,
    reset: vi.fn(),
    variables: undefined,
    status: isPending ? "pending" : "idle",
    submittedAt: 0,
    failureCount: 0,
    failureReason: null,
    context: undefined,
    isPaused: false,
  };
}

function makeApiError(code: string, status = 403): { data: { code: string }; status: number } {
  return { data: { code }, status };
}

describe("StatusOverrideDialog", () => {
  const accountId = "acc-test-001";
  let onSuccess: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSuccess = vi.fn();
    onClose = vi.fn();
  });

  it("offers SOLD, INACTIVE, and Clear Override options", () => {
    vi.mocked(useSetAccountStatusOverride).mockReturnValue(
      makeMutation(vi.fn().mockResolvedValue({})),
    );
    render(
      <StatusOverrideDialog open accountId={accountId} onSuccess={onSuccess} onClose={onClose} />,
    );
    expect(screen.getByText("فروخته‌شده")).toBeInTheDocument();
    expect(screen.getByText("غیرفعال")).toBeInTheDocument();
    expect(screen.getByText("پاک‌کردن وضعیت دستی")).toBeInTheDocument();
  });

  it("does NOT offer AVAILABLE or PARTIALLY_SOLD", () => {
    vi.mocked(useSetAccountStatusOverride).mockReturnValue(
      makeMutation(vi.fn().mockResolvedValue({})),
    );
    render(
      <StatusOverrideDialog open accountId={accountId} onSuccess={onSuccess} onClose={onClose} />,
    );
    // Code-level strings must not appear as selectable options
    expect(screen.queryByText("AVAILABLE")).not.toBeInTheDocument();
    expect(screen.queryByText("PARTIALLY_SOLD")).not.toBeInTheDocument();
    // Persian equivalent labels must not appear as selectable buttons
    expect(screen.queryByRole("button", { name: /موجود/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /نیمه‌فروخته/ })).not.toBeInTheDocument();
    // Only exactly three choice buttons should be present
    expect(screen.getAllByRole("button").filter(
      (b) => ["فروخته‌شده", "غیرفعال", "پاک‌کردن وضعیت دستی"].some(
        (label) => b.textContent?.includes(label),
      ),
    )).toHaveLength(3);
  });

  it("sends { statusOverride: 'SOLD' } when SOLD is selected", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useSetAccountStatusOverride).mockReturnValue(makeMutation(mutateAsync));
    render(
      <StatusOverrideDialog open accountId={accountId} onSuccess={onSuccess} onClose={onClose} />,
    );
    fireEvent.click(screen.getByText("فروخته‌شده"));
    fireEvent.click(screen.getByText("اعمال"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      accountId,
      data: { statusOverride: "SOLD" },
    }));
  });

  it("sends { statusOverride: 'INACTIVE' } when INACTIVE is selected", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useSetAccountStatusOverride).mockReturnValue(makeMutation(mutateAsync));
    render(
      <StatusOverrideDialog open accountId={accountId} onSuccess={onSuccess} onClose={onClose} />,
    );
    fireEvent.click(screen.getByText("غیرفعال"));
    fireEvent.click(screen.getByText("اعمال"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      accountId,
      data: { statusOverride: "INACTIVE" },
    }));
  });

  it("sends { statusOverride: null } for Clear Override", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useSetAccountStatusOverride).mockReturnValue(makeMutation(mutateAsync));
    render(
      <StatusOverrideDialog open accountId={accountId} onSuccess={onSuccess} onClose={onClose} />,
    );
    fireEvent.click(screen.getByText("پاک‌کردن وضعیت دستی"));
    fireEvent.click(screen.getByText("اعمال"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      accountId,
      data: { statusOverride: null },
    }));
  });

  it("calls onSuccess after successful mutation", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useSetAccountStatusOverride).mockReturnValue(makeMutation(mutateAsync));
    render(
      <StatusOverrideDialog open accountId={accountId} onSuccess={onSuccess} onClose={onClose} />,
    );
    fireEvent.click(screen.getByText("فروخته‌شده"));
    fireEvent.click(screen.getByText("اعمال"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it("shows PERSIAN_DISABLED_MSG when ACCOUNT_OPS_DISABLED", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(makeApiError("ACCOUNT_OPS_DISABLED"));
    vi.mocked(useSetAccountStatusOverride).mockReturnValue(makeMutation(mutateAsync));
    render(
      <StatusOverrideDialog open accountId={accountId} onSuccess={onSuccess} onClose={onClose} />,
    );
    fireEvent.click(screen.getByText("فروخته‌شده"));
    fireEvent.click(screen.getByText("اعمال"));
    await waitFor(() => expect(screen.getByText(PERSIAN_DISABLED_MSG)).toBeInTheDocument());
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("shows PERSIAN_GENERIC_MSG for unknown error", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(makeApiError("SOME_UNKNOWN_ERROR", 500));
    vi.mocked(useSetAccountStatusOverride).mockReturnValue(makeMutation(mutateAsync));
    render(
      <StatusOverrideDialog open accountId={accountId} onSuccess={onSuccess} onClose={onClose} />,
    );
    fireEvent.click(screen.getByText("غیرفعال"));
    fireEvent.click(screen.getByText("اعمال"));
    await waitFor(() => expect(screen.getByText(PERSIAN_GENERIC_MSG)).toBeInTheDocument());
  });

  it("does not render when open=false", () => {
    vi.mocked(useSetAccountStatusOverride).mockReturnValue(
      makeMutation(vi.fn().mockResolvedValue({})),
    );
    render(
      <StatusOverrideDialog open={false} accountId={accountId} onSuccess={onSuccess} onClose={onClose} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    vi.mocked(useSetAccountStatusOverride).mockReturnValue(
      makeMutation(vi.fn().mockResolvedValue({})),
    );
    render(
      <StatusOverrideDialog open accountId={accountId} onSuccess={onSuccess} onClose={onClose} />,
    );
    fireEvent.click(screen.getByText("انصراف"));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not render raw error messages, URLs, passwords, or server text", async () => {
    const mutateAsync = vi.fn().mockRejectedValue({
      data: { code: "SOME_ERROR", error: "raw internal server error with SQL" },
      status: 500,
    });
    vi.mocked(useSetAccountStatusOverride).mockReturnValue(makeMutation(mutateAsync));
    render(
      <StatusOverrideDialog open accountId={accountId} onSuccess={onSuccess} onClose={onClose} />,
    );
    fireEvent.click(screen.getByText("فروخته‌شده"));
    fireEvent.click(screen.getByText("اعمال"));
    await waitFor(() => screen.getByText(PERSIAN_GENERIC_MSG));
    expect(screen.queryByText("raw internal server error with SQL")).not.toBeInTheDocument();
  });
});
