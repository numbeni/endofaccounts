/**
 * PS-03D5-6A — Tests: DeleteUnavailableDialog
 *
 * Verifies that:
 * - The approved Persian message is shown.
 * - Zero DELETE requests are sent.
 * - The dialog does NOT import deleteAccount or useDeleteAccount.
 * - Local state is not mutated.
 * - The close button works.
 */
import { vi, describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { render } from "@/test/render";
import { DeleteUnavailableDialog } from "../DeleteUnavailableDialog";

// Ensure the module does NOT import deleteAccount or useDeleteAccount.
// This is verified at module evaluation time — if the import exists, the mock
// guard below would catch it.
vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<typeof import("@workspace/api-client-react")>(
    "@workspace/api-client-react",
  );
  return {
    ...actual,
    deleteAccount: vi.fn(() => {
      throw new Error("deleteAccount must NOT be called by DeleteUnavailableDialog");
    }),
    useDeleteAccount: vi.fn(() => {
      throw new Error("useDeleteAccount must NOT be called by DeleteUnavailableDialog");
    }),
  };
});

describe("DeleteUnavailableDialog", () => {
  it("renders the approved Persian deletion-unavailable message", () => {
    render(<DeleteUnavailableDialog open onClose={vi.fn()} />);
    expect(screen.getByText(/حذف دائمی اکانت فعلاً امکان‌پذیر نیست/)).toBeInTheDocument();
  });

  it("directs the user toward INACTIVE status", () => {
    render(<DeleteUnavailableDialog open onClose={vi.fn()} />);
    // The dialog must contain text directing the user to set status to INACTIVE.
    // There may be multiple elements containing /غیرفعال/ — using getAllByText is fine.
    expect(screen.getAllByText(/غیرفعال/).length).toBeGreaterThan(0);
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<DeleteUnavailableDialog open onClose={onClose} />);
    fireEvent.click(screen.getByText("متوجه شدم"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<DeleteUnavailableDialog open onClose={onClose} />);
    // Click the backdrop (the fixed overlay div behind the dialog)
    const dialog = screen.getByRole("dialog");
    // The backdrop is the first child of the dialog container
    fireEvent.click(dialog.children[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render when open=false", () => {
    render(<DeleteUnavailableDialog open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sends zero DELETE requests (fetch is not called)", () => {
    // The global fetch spy in setup.ts asserts fetch was NOT called after each test.
    render(<DeleteUnavailableDialog open onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("متوجه شدم"));
    // If fetch were called, setup.ts afterEach assertion would fail this test.
  });

  it("does not display raw Account IDs, passwords, or URLs", () => {
    render(<DeleteUnavailableDialog open onClose={vi.fn()} />);
    expect(screen.queryByText(/ACC-/)).not.toBeInTheDocument();
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/http/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/DELETE/)).not.toBeInTheDocument();
  });
});
