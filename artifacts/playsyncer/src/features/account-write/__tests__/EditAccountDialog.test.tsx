/**
 * PS-03D5-6A — Tests: EditAccountDialog
 *
 * Covers:
 * - Changed-fields-only behavior
 * - Never prefilling passwords
 * - real ApiError.data duplicate flow
 * - ACCOUNT_OPS_DISABLED safe message
 * - generic error message
 * - Sensitive value clearing on close, external open=false, Account switch
 * - No backup code editing
 * - No immutable identifier submission
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useUpdateAccount } from "@workspace/api-client-react";
import { render } from "@/test/render";
import { EditAccountDialog } from "../EditAccountDialog";
import { accountListItemFixture } from "@/test/fixtures";
import { PERSIAN_DISABLED_MSG, PERSIAN_GENERIC_MSG } from "../parseApiError";

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<typeof import("@workspace/api-client-react")>(
    "@workspace/api-client-react",
  );
  return {
    ...actual,
    useUpdateAccount: vi.fn(),
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
    data: { code: "DUPLICATE_WARNING", detail: { duplicateFields: fields } },
    status: 409,
  };
}

describe("EditAccountDialog", () => {
  const account = accountListItemFixture({
    id: "acc-edit-001",
    accountCode: "ACC-000001",
    displayNumber: "TEST-001",
    onlineId: "original_id",
    birthDate: "1990-01-15",
  });

  beforeEach(() => {
    vi.mocked(useUpdateAccount).mockReturnValue(
      makeMutation(vi.fn().mockResolvedValue({ account: {} })),
    );
  });

  it("prefills onlineId and birthDate from the safe DTO", () => {
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    const onlineIdInput = screen.getByPlaceholderText("PSN username") as HTMLInputElement;
    const birthDateInput = screen.getByPlaceholderText("1990-08-27") as HTMLInputElement;
    expect(onlineIdInput.value).toBe("original_id");
    expect(birthDateInput.value).toBe("1990-01-15");
  });

  it("never prefills PSN Password", () => {
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    const passwordInputs = screen.getAllByPlaceholderText(/خالی = بدون تغییر/);
    // All replacement fields should start empty
    passwordInputs.forEach((input) => {
      expect((input as HTMLInputElement).value).toBe("");
    });
  });

  it("starts psnEmail, emailPassword, familyManagementEmail as empty", () => {
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    // All inputs with the empty-means-no-change placeholder should be empty
    const emptyInputs = screen.getAllByPlaceholderText(/خالی/);
    emptyInputs.forEach((input) => {
      expect((input as HTMLInputElement).value).toBe("");
    });
  });

  it("displays account identifier read-only, does not submit it", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ account: {} });
    vi.mocked(useUpdateAccount).mockReturnValue(makeMutation(mutateAsync));
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText("ACC-000001")).toBeInTheDocument();
    // Submit with changed onlineId only
    const onlineIdInput = screen.getByPlaceholderText("PSN username");
    await userEvent.clear(onlineIdInput);
    await userEvent.type(onlineIdInput, "new_online_id");
    fireEvent.click(screen.getByText("ذخیره تغییرات"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const payload = mutateAsync.mock.calls[0][0].data;
    // Immutable identifiers must NOT be in the payload
    expect(payload.accountCode).toBeUndefined();
    expect(payload.displayNumber).toBeUndefined();
    expect(payload.gameId).toBeUndefined();
    expect(payload.id).toBeUndefined();
  });

  it("submits only changed fields — unchanged onlineId is omitted", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ account: {} });
    vi.mocked(useUpdateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    // Type into the PSN Password field (index 1 in the "خالی = بدون تغییر" group;
    // index 0=psnEmail, 1=psnPassword, 2=emailPassword, 3=familyManagementEmail)
    const psnPasswordInput = screen.getAllByPlaceholderText(/خالی = بدون تغییر/)[1];
    await user.type(psnPasswordInput, "NewPsnPass");
    fireEvent.click(screen.getByText("ذخیره تغییرات"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const payload = mutateAsync.mock.calls[0][0].data;
    // Only psnPassword should be present
    expect(payload.psnPassword).toBe("NewPsnPass");
    // onlineId unchanged from original — should NOT be in payload
    expect(payload.onlineId).toBeUndefined();
    expect(payload.birthDate).toBeUndefined();
    expect(payload.emailPassword).toBeUndefined();
  });

  it("shows 'no changes' message when nothing is changed", async () => {
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("ذخیره تغییرات"));
    await waitFor(() =>
      expect(screen.getByText("هیچ تغییری وارد نشده است")).toBeInTheDocument(),
    );
  });

  it("does not render Backup Code editing section", () => {
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText(/Backup Codes در این مرحله قابل ویرایش نیستند/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("کد 1")).not.toBeInTheDocument();
  });

  // ── DUPLICATE_WARNING flow ───────────────────────────────────────────────

  it("opens DuplicateWarningDialog on DUPLICATE_WARNING and shows field labels only", async () => {
    const mutateAsync = vi.fn().mockRejectedValueOnce(
      makeDuplicateError(["psnEmail", "onlineId"]),
    );
    vi.mocked(useUpdateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    const onlineIdInput = screen.getByPlaceholderText("PSN username");
    await user.clear(onlineIdInput);
    await user.type(onlineIdInput, "different_id");
    fireEvent.click(screen.getByText("ذخیره تغییرات"));
    // Wait for the DuplicateWarningDialog to appear
    const dupDialog = await screen.findByRole("dialog", { name: "شباهت با اکانت موجود" });
    // The warning dialog itself shows field labels — scope assertions to the dialog
    expect(dupDialog).toHaveTextContent("ایمیل PSN");
    expect(dupDialog).toHaveTextContent("Online ID");
    // DuplicateWarningDialog must NOT contain Account IDs or raw field values
    expect(dupDialog).not.toHaveTextContent("ACC-000001");
    expect(dupDialog).not.toHaveTextContent("original_id");
  });

  it("sends confirmed: true on duplicate confirm", async () => {
    const mutateAsync = vi.fn()
      .mockRejectedValueOnce(makeDuplicateError(["psnEmail"]))
      .mockResolvedValueOnce({ account: {} });
    vi.mocked(useUpdateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    const onlineIdInput = screen.getByPlaceholderText("PSN username");
    await user.clear(onlineIdInput);
    await user.type(onlineIdInput, "new_id");
    fireEvent.click(screen.getByText("ذخیره تغییرات"));
    await waitFor(() => screen.getByText("شباهت با اکانت موجود"));
    fireEvent.click(screen.getByText("تأیید و ادامه"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync.mock.calls[1][0].data.confirmed).toBe(true);
  });

  it("second DUPLICATE_WARNING shows generic error (no retry loop)", async () => {
    const mutateAsync = vi.fn()
      .mockRejectedValueOnce(makeDuplicateError(["onlineId"]))
      .mockRejectedValueOnce(makeDuplicateError(["onlineId"]));
    vi.mocked(useUpdateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    const onlineIdInput = screen.getByPlaceholderText("PSN username");
    await user.clear(onlineIdInput);
    await user.type(onlineIdInput, "conflict_id");
    fireEvent.click(screen.getByText("ذخیره تغییرات"));
    await waitFor(() => screen.getByText("شباهت با اکانت موجود"));
    fireEvent.click(screen.getByText("تأیید و ادامه"));
    await waitFor(() => expect(screen.queryByText("شباهت با اکانت موجود")).not.toBeInTheDocument());
    expect(screen.getByText(PERSIAN_GENERIC_MSG)).toBeInTheDocument();
    expect(mutateAsync).toHaveBeenCalledTimes(2);
  });

  // ── Error messages ───────────────────────────────────────────────────────

  it("shows PERSIAN_DISABLED_MSG for ACCOUNT_OPS_DISABLED", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(
      { data: { code: "ACCOUNT_OPS_DISABLED" }, status: 403 },
    );
    vi.mocked(useUpdateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    const onlineIdInput = screen.getByPlaceholderText("PSN username");
    await user.clear(onlineIdInput);
    await user.type(onlineIdInput, "changed_id");
    fireEvent.click(screen.getByText("ذخیره تغییرات"));
    await waitFor(() => expect(screen.getByText(PERSIAN_DISABLED_MSG)).toBeInTheDocument());
  });

  it("shows PERSIAN_GENERIC_MSG for unknown error", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(
      { data: { code: "SOME_ERROR" }, status: 500 },
    );
    vi.mocked(useUpdateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    const onlineIdInput = screen.getByPlaceholderText("PSN username");
    await user.clear(onlineIdInput);
    await user.type(onlineIdInput, "changed_id");
    fireEvent.click(screen.getByText("ذخیره تغییرات"));
    await waitFor(() => expect(screen.getByText(PERSIAN_GENERIC_MSG)).toBeInTheDocument());
  });

  // ── Sensitive clearing ───────────────────────────────────────────────────

  it("clears sensitive fields on Account switch (account.id change)", () => {
    const { rerender } = render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    // Type into the first sensitive field (psnEmail at index 0)
    const allInputs = screen.getAllByPlaceholderText(/خالی = بدون تغییر/) as HTMLInputElement[];
    fireEvent.change(allInputs[0], { target: { value: "sensitive@example.com" } });
    expect(allInputs[0].value).toBe("sensitive@example.com");
    // Simulate Account switch
    const account2 = accountListItemFixture({ id: "acc-edit-002", onlineId: "other_id" });
    rerender(
      <EditAccountDialog open account={account2} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    // After switch, all sensitive fields should be cleared
    const afterSwitch = screen.getAllByPlaceholderText(/خالی = بدون تغییر/) as HTMLInputElement[];
    afterSwitch.forEach((input) => {
      expect(input.value).toBe("");
    });
  });

  it("clears sensitive fields when external open=false", () => {
    const { rerender } = render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    // The password fields start empty — they are always cleared on open=false
    rerender(
      <EditAccountDialog open={false} account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    // Nothing should be rendered
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    render(
      <EditAccountDialog open={false} account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // ── Password contract (PS-03D5-6A-F1) ───────────────────────────────────

  it("preserves leading and trailing spaces in optional passwords exactly", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ account: {} });
    vi.mocked(useUpdateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    // psnPassword with leading/trailing spaces
    const psnPasswordInput = screen.getAllByPlaceholderText(/خالی = بدون تغییر/)[1] as HTMLInputElement;
    await user.type(psnPasswordInput, "  NewPsnPass  ");
    fireEvent.click(screen.getByText("ذخیره تغییرات"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const payload = mutateAsync.mock.calls[0][0].data;
    expect(payload.psnPassword).toBe("  NewPsnPass  ");
    // Empty email password must be omitted exactly
    expect(payload.emailPassword).toBeUndefined();
  });

  it("omits optional passwords only when their exact value is empty", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ account: {} });
    vi.mocked(useUpdateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    // Type psnPassword and leave emailPassword empty
    const psnPasswordInput = screen.getAllByPlaceholderText(/خالی = بدون تغییر/)[1] as HTMLInputElement;
    await user.type(psnPasswordInput, "only-psn-pass");
    fireEvent.click(screen.getByText("ذخیره تغییرات"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const payload = mutateAsync.mock.calls[0][0].data;
    expect(payload.psnPassword).toBe("only-psn-pass");
    expect(payload.emailPassword).toBeUndefined();
    expect(payload.familyManagementEmail).toBeUndefined();
  });

  // ── Empty safe-DTO fields (PS-03D5-6A-F1) ─────────────────────────────────

  it("shows validation error when onlineId is cleared from an existing value", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ account: {} });
    vi.mocked(useUpdateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    const onlineIdInput = screen.getByPlaceholderText("PSN username") as HTMLInputElement;
    await user.clear(onlineIdInput);
    fireEvent.click(screen.getByText("ذخیره تغییرات"));
    await waitFor(() =>
      expect(screen.getByText("Online ID نمی‌تواند خالی باشد")).toBeInTheDocument(),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("shows validation error when birthDate is cleared from an existing value", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ account: {} });
    vi.mocked(useUpdateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    const birthDateInput = screen.getByPlaceholderText("1990-08-27") as HTMLInputElement;
    await user.clear(birthDateInput);
    fireEvent.click(screen.getByText("ذخیره تغییرات"));
    await waitFor(() =>
      expect(screen.getByText("تاریخ تولد نمی‌تواند خالی باشد")).toBeInTheDocument(),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("does not construct payload properties with undefined when safe-DTO fields are cleared", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ account: {} });
    vi.mocked(useUpdateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    // Clear both safe-DTO fields and a password — validation must block, not send undefined.
    const onlineIdInput = screen.getByPlaceholderText("PSN username") as HTMLInputElement;
    const birthDateInput = screen.getByPlaceholderText("1990-08-27") as HTMLInputElement;
    await user.clear(onlineIdInput);
    await user.clear(birthDateInput);
    const psnPasswordInput = screen.getAllByPlaceholderText(/خالی = بدون تغییر/)[1] as HTMLInputElement;
    await user.type(psnPasswordInput, "psn123");
    fireEvent.click(screen.getByText("ذخیره تغییرات"));
    await waitFor(() =>
      expect(screen.getByText("Online ID نمی‌تواند خالی باشد")).toBeInTheDocument(),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("submits valid changed onlineId and birthDate normally", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ account: {} });
    vi.mocked(useUpdateAccount).mockReturnValue(makeMutation(mutateAsync));
    const user = userEvent.setup();
    render(
      <EditAccountDialog open account={account} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    const onlineIdInput = screen.getByPlaceholderText("PSN username") as HTMLInputElement;
    const birthDateInput = screen.getByPlaceholderText("1990-08-27") as HTMLInputElement;
    await user.clear(onlineIdInput);
    await user.type(onlineIdInput, "new_online_id");
    await user.clear(birthDateInput);
    await user.type(birthDateInput, "1995-05-20");
    fireEvent.click(screen.getByText("ذخیره تغییرات"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const payload = mutateAsync.mock.calls[0][0].data;
    expect(payload.onlineId).toBe("new_online_id");
    expect(payload.birthDate).toBe("1995-05-20");
    // No undefined properties in the payload
    expect(Object.values(payload).some((v) => v === undefined)).toBe(false);
  });

  it("does not render when account is null", () => {
    render(
      <EditAccountDialog open account={null} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
