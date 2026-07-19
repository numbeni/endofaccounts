/**
 * PS-03D5-6A-F1 — Tests: DuplicateWarningDialog
 *
 * Covers:
 * - Only approved Persian field labels are shown.
 * - Unknown internal field names are NEVER rendered raw.
 * - Cancel sends no confirm.
 * - Confirm signals one retry.
 */
import { vi, describe, it, expect } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { render } from "@/test/render";
import { DuplicateWarningDialog } from "../DuplicateWarningDialog";

describe("DuplicateWarningDialog", () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  it("displays only approved Persian labels for known fields", () => {
    render(
      <DuplicateWarningDialog
        open
        duplicateFields={["psnEmail", "familyManagementEmail", "onlineId"]}
        onConfirm={onConfirm}
        onCancel={onCancel}
        isPending={false}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "شباهت با اکانت موجود" });
    expect(dialog).toHaveTextContent("ایمیل PSN");
    expect(dialog).toHaveTextContent("ایمیل مدیریت خانواده");
    expect(dialog).toHaveTextContent("Online ID");
  });

  it("does not render unknown internal field names raw", () => {
    render(
      <DuplicateWarningDialog
        open
        duplicateFields={["internal_secret_field", "accountCode", "rawId"]}
        onConfirm={onConfirm}
        onCancel={onCancel}
        isPending={false}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "شباهت با اکانت موجود" });
    // Raw unknown names must not appear.
    expect(dialog).not.toHaveTextContent("internal_secret_field");
    expect(dialog).not.toHaveTextContent("accountCode");
    expect(dialog).not.toHaveTextContent("rawId");
    // Instead, a safe generic Persian label is shown.
    expect(dialog).toHaveTextContent("فیلد مشابه");
  });

  it("never shows field values or account IDs", () => {
    render(
      <DuplicateWarningDialog
        open
        duplicateFields={["psnEmail", "onlineId"]}
        onConfirm={onConfirm}
        onCancel={onCancel}
        isPending={false}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "شباهت با اکانت موجود" });
    expect(dialog).not.toHaveTextContent("@");
    expect(dialog).not.toHaveTextContent("ACC-");
    expect(dialog).not.toHaveTextContent("http");
  });

  it("calls onConfirm when confirm is clicked", () => {
    render(
      <DuplicateWarningDialog
        open
        duplicateFields={["psnEmail"]}
        onConfirm={onConfirm}
        onCancel={onCancel}
        isPending={false}
      />,
    );
    fireEvent.click(screen.getByText("تأیید و ادامه"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onCancel when cancel is clicked", () => {
    render(
      <DuplicateWarningDialog
        open
        duplicateFields={["psnEmail"]}
        onConfirm={onConfirm}
        onCancel={onCancel}
        isPending={false}
      />,
    );
    fireEvent.click(screen.getByText("انصراف"));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does not render when open=false", () => {
    render(
      <DuplicateWarningDialog
        open={false}
        duplicateFields={["psnEmail"]}
        onConfirm={onConfirm}
        onCancel={onCancel}
        isPending={false}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
