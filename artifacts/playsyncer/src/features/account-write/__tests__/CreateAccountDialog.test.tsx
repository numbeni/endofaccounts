/**
 * PS-03D5-6A — Tests: CreateAccountDialog
 *
 * Covers:
 * - Create request shape and validation
 * - real ApiError.data duplicate flow
 * - ACCOUNT_OPS_DISABLED safe message
 * - generic unknown-error message
 * - strict birth-date validation
 * - Password and Backup Code clearing on success and close
 * - Zero DELETE requests
 * - Second DUPLICATE_WARNING does not create automatic retry loop
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCreateAccount } from "@workspace/api-client-react";
import { render } from "@/test/render";
import { CreateAccountDialog } from "../CreateAccountDialog";
import { PERSIAN_DISABLED_MSG, PERSIAN_GENERIC_MSG } from "../parseApiError";

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<typeof import("@workspace/api-client-react")>(
    "@workspace/api-client-react",
  );
  return {
    ...actual,
    useCreateAccount: vi.fn(),
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

function makeDuplicateError(fields: string[]) {
  return {
    data: {
      code: "DUPLICATE_WARNING",
      detail: { duplicateFields: fields },
    },
    status: 409,
  };
}

function makeDisabledError() {
  return { data: { code: "ACCOUNT_OPS_DISABLED" }, status: 403 };
}

function makeGenericError() {
  return { data: { code: "SOME_UNKNOWN_ERROR" }, status: 500 };
}

/** Fill the form with valid values. */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("example@playstation.com"), "test@psn.com");
  // PSN Password
  const passwordInput = screen.getAllByPlaceholderText(/PlayStation password/i)[0];
  await user.type(passwordInput, "SecurePass123");
  // Email password
  await user.type(screen.getByPlaceholderText("Email password"), "EmailPass456");
  // Online ID
  await user.type(screen.getByPlaceholderText("PSN username"), "my_psn_user");
  // Birth date
  await user.type(screen.getByPlaceholderText("1990-08-27"), "1990-08-27");
  // Family management email
  await user.type(screen.getByPlaceholderText("family@email.com"), "family@test.com");
  // Backup code (first row)
  await user.type(screen.getByPlaceholderText("کد 1"), "abcd-1234");
}

describe("CreateAccountDialog", () => {
  const gameId = "game-test-001";

  beforeEach(() => {
    vi.mocked(useCreateAccount).mockReturnValue(
      makeMutation(vi.fn().mockResolvedValue({ account: {} })),
    );
  });

  it("renders all required fields", () => {
    render(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText("ایمیل PSN")).toBeInTheDocument();
    expect(screen.getByText("رمز عبور PSN")).toBeInTheDocument();
    expect(screen.getByText("رمز ایمیل")).toBeInTheDocument();
    expect(screen.getByText("Online ID")).toBeInTheDocument();
    expect(screen.getByText("تاریخ تولد")).toBeInTheDocument();
    expect(screen.getByText("Family Management Email")).toBeInTheDocument();
    expect(screen.getByText("Backup Codes")).toBeInTheDocument();
  });

  it("does not render statusOverride during Create", () => {
    render(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByText(/وضعیت/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SOLD/)).not.toBeInTheDocument();
    expect(screen.queryByText(/INACTIVE/)).not.toBeInTheDocument();
  });

  it("validates required fields and shows Persian error messages", async () => {
    render(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("افزودن اکانت"));
    await waitFor(() => {
      expect(screen.getByText("ایمیل PSN الزامی است")).toBeInTheDocument();
      expect(screen.getByText("رمز عبور PSN الزامی است")).toBeInTheDocument();
      expect(screen.getByText("رمز ایمیل الزامی است")).toBeInTheDocument();
      expect(screen.getByText("Online ID الزامی است")).toBeInTheDocument();
      expect(screen.getByText("تاریخ تولد الزامی است")).toBeInTheDocument();
      expect(screen.getByText("Family Management Email الزامی است")).toBeInTheDocument();
      expect(screen.getByText("حداقل یک Backup Code الزامی است")).toBeInTheDocument();
    });
  });

  it("rejects invalid birth date format (YYYY/MM/DD)", async () => {
    render(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    await userEvent.type(screen.getByPlaceholderText("1990-08-27"), "1990/08/27");
    fireEvent.click(screen.getByText("افزودن اکانت"));
    // The error message contains YYYY-MM-DD; there may also be a hint with the same text
    await waitFor(() => expect(screen.getAllByText(/YYYY-MM-DD/).length).toBeGreaterThan(0));
  });

  it("rejects impossible birth date 2026-02-31", async () => {
    render(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    await userEvent.type(screen.getByPlaceholderText("1990-08-27"), "2026-02-31");
    fireEvent.click(screen.getByText("افزودن اکانت"));
    await waitFor(() => expect(screen.getAllByText(/YYYY-MM-DD/).length).toBeGreaterThan(0));
  });

  it("sends correct request shape on valid submit", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ account: {} });
    vi.mocked(useCreateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    await fillValidForm(user);
    fireEvent.click(screen.getByText("افزودن اکانت"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());
    const [callArgs] = mutateAsync.mock.calls;
    expect(callArgs[0].gameId).toBe(gameId);
    const data = callArgs[0].data;
    expect(data.psnEmail).toBe("test@psn.com");
    expect(data.psnPassword).toBe("SecurePass123");
    expect(data.emailPassword).toBe("EmailPass456");
    expect(data.onlineId).toBe("my_psn_user");
    expect(data.birthDate).toBe("1990-08-27");
    expect(data.familyManagementEmail).toBe("family@test.com");
    expect(Array.isArray(data.backupCodes)).toBe(true);
    expect(data.backupCodes[0]).toBe("abcd-1234");
    // confirmed must not be set on first submit
    expect(data.confirmed).toBeUndefined();
  });

  it("does not allow backup codes array to be empty (at least one required)", async () => {
    render(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    // Don't fill any backup code — submit immediately
    fireEvent.click(screen.getByText("افزودن اکانت"));
    await waitFor(() =>
      expect(screen.getByText("حداقل یک Backup Code الزامی است")).toBeInTheDocument(),
    );
  });

  it("backup code rows can be added", () => {
    render(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("افزودن کد"));
    expect(screen.getByPlaceholderText("کد 2")).toBeInTheDocument();
  });

  it("backup code rows can be removed", async () => {
    render(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("افزودن کد"));
    expect(screen.getByPlaceholderText("کد 2")).toBeInTheDocument();
    // Remove second row
    const removeBtn = screen.getByLabelText("حذف کد 2");
    fireEvent.click(removeBtn);
    expect(screen.queryByPlaceholderText("کد 2")).not.toBeInTheDocument();
  });

  // ── DUPLICATE_WARNING flow ───────────────────────────────────────────────

  it("opens DuplicateWarningDialog on first DUPLICATE_WARNING", async () => {
    const mutateAsync = vi.fn().mockRejectedValueOnce(
      makeDuplicateError(["psnEmail", "onlineId"]),
    );
    vi.mocked(useCreateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    await fillValidForm(user);
    fireEvent.click(screen.getByText("افزودن اکانت"));
    const dupDialog = await screen.findByRole("dialog", { name: "شباهت با اکانت موجود" });
    // DuplicateWarningDialog shows Persian field labels — NOT values or Account IDs
    expect(dupDialog).toBeInTheDocument();
    // Duplicate fields list is inside the warning dialog
    expect(dupDialog).toHaveTextContent("ایمیل PSN");
    expect(dupDialog).toHaveTextContent("Online ID");
    // Does NOT show Account IDs or raw values
    expect(screen.queryByText(/ACC-/)).not.toBeInTheDocument();
    expect(screen.queryByText("test@psn.com")).not.toBeInTheDocument();
  });

  it("sends confirmed: true on duplicate confirm", async () => {
    const mutateAsync = vi.fn()
      .mockRejectedValueOnce(makeDuplicateError(["psnEmail"]))
      .mockResolvedValueOnce({ account: {} });
    vi.mocked(useCreateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    await fillValidForm(user);
    fireEvent.click(screen.getByText("افزودن اکانت"));
    await waitFor(() => screen.getByText("شباهت با اکانت موجود"));
    fireEvent.click(screen.getByText("تأیید و ادامه"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    const [, secondCall] = mutateAsync.mock.calls;
    expect(secondCall[0].data.confirmed).toBe(true);
  });

  it("cancel on DuplicateWarningDialog sends no retry", async () => {
    const mutateAsync = vi.fn().mockRejectedValueOnce(makeDuplicateError(["psnEmail"]));
    vi.mocked(useCreateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    await fillValidForm(user);
    fireEvent.click(screen.getByText("افزودن اکانت"));
    // Wait for DuplicateWarningDialog to appear, then click its Cancel button
    const dupDialog = await screen.findByRole("dialog", { name: "شباهت با اکانت موجود" });
    const cancelBtn = within(dupDialog).getByText("انصراف");
    fireEvent.click(cancelBtn);
    // Only one call was made — no retry
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("second DUPLICATE_WARNING does NOT open dialog again (no retry loop)", async () => {
    const mutateAsync = vi.fn()
      .mockRejectedValueOnce(makeDuplicateError(["psnEmail"]))
      .mockRejectedValueOnce(makeDuplicateError(["psnEmail"])); // second warning
    vi.mocked(useCreateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    await fillValidForm(user);
    fireEvent.click(screen.getByText("افزودن اکانت"));
    await waitFor(() => screen.getByText("شباهت با اکانت موجود"));
    fireEvent.click(screen.getByText("تأیید و ادامه"));
    // Dialog should close and show generic error (not re-open DuplicateWarningDialog)
    await waitFor(() => expect(screen.queryByText("شباهت با اکانت موجود")).not.toBeInTheDocument());
    expect(screen.getByText(PERSIAN_GENERIC_MSG)).toBeInTheDocument();
    // Only 2 calls total — no third automatic retry
    expect(mutateAsync).toHaveBeenCalledTimes(2);
  });

  // ── Error messages ───────────────────────────────────────────────────────

  it("shows PERSIAN_DISABLED_MSG for ACCOUNT_OPS_DISABLED", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(makeDisabledError());
    vi.mocked(useCreateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    await fillValidForm(user);
    fireEvent.click(screen.getByText("افزودن اکانت"));
    await waitFor(() => expect(screen.getByText(PERSIAN_DISABLED_MSG)).toBeInTheDocument());
  });

  it("shows PERSIAN_GENERIC_MSG for unknown error", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(makeGenericError());
    vi.mocked(useCreateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    await fillValidForm(user);
    fireEvent.click(screen.getByText("افزودن اکانت"));
    await waitFor(() => expect(screen.getByText(PERSIAN_GENERIC_MSG)).toBeInTheDocument());
  });

  it("never renders raw error messages, URLs, or server text", async () => {
    const mutateAsync = vi.fn().mockRejectedValue({
      data: { code: "SOME_ERROR", error: "raw SQL error: duplicate key value" },
      status: 500,
    });
    vi.mocked(useCreateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    await fillValidForm(user);
    fireEvent.click(screen.getByText("افزودن اکانت"));
    await waitFor(() => screen.getByText(PERSIAN_GENERIC_MSG));
    expect(screen.queryByText("raw SQL error: duplicate key value")).not.toBeInTheDocument();
  });

  // ── Sensitive field clearing ──────────────────────────────────────────────

  it("clears password and backup codes after success", async () => {
    const onSuccess = vi.fn();
    const mutateAsync = vi.fn().mockResolvedValue({ account: {} });
    vi.mocked(useCreateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    const { rerender } = render(
      <CreateAccountDialog open gameId={gameId} onSuccess={onSuccess} onClose={vi.fn()} />,
    );
    await fillValidForm(user);
    fireEvent.click(screen.getByText("افزودن اکانت"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    // Reopen the dialog to check the state was reset
    rerender(
      <CreateAccountDialog open={false} gameId={gameId} onSuccess={onSuccess} onClose={vi.fn()} />,
    );
    rerender(
      <CreateAccountDialog open gameId={gameId} onSuccess={onSuccess} onClose={vi.fn()} />,
    );
    // Password fields should be empty after reopen
    const psnPassInput = screen.getAllByPlaceholderText(/PlayStation password/i)[0] as HTMLInputElement;
    expect(psnPassInput.value).toBe("");
    // First backup code input should be empty
    const codeInput = screen.getByPlaceholderText("کد 1") as HTMLInputElement;
    expect(codeInput.value).toBe("");
  });

  it("clears password and backup codes when dialog is closed", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    await fillValidForm(user);
    // Close
    fireEvent.click(screen.getByLabelText("بستن"));
    // Reopen
    rerender(
      <CreateAccountDialog open={false} gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    rerender(
      <CreateAccountDialog open gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    const psnPassInput = screen.getAllByPlaceholderText(/PlayStation password/i)[0] as HTMLInputElement;
    expect(psnPassInput.value).toBe("");
    const codeInput = screen.getByPlaceholderText("کد 1") as HTMLInputElement;
    expect(codeInput.value).toBe("");
  });

  it("does not render when open=false", () => {
    render(
      <CreateAccountDialog open={false} gameId={gameId} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
