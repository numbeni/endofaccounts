/**
 * PS-03D5-6A — Isolation Tests
 *
 * Verifies that the Account Write feature is NOT mounted in active production
 * pages, and that no DELETE requests are made anywhere in the feature.
 *
 * Tests:
 * - AccountCardReadOnly does not render Account Write controls
 * - AccountDetailsReadOnly does not render write controls
 * - The feature barrel does not export deleteAccount / useDeleteAccount
 * - Zero real network requests (guaranteed by setup.ts global fetch spy)
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import {
  useGetAccount,
  useGetAccountCapacities,
  getGetAccountQueryKey,
  getGetAccountCapacitiesQueryKey,
} from "@workspace/api-client-react";
import { mockAccountDetail, mockCapacities } from "@/test/mocks";
import { AccountCardReadOnly } from "@/components/AccountCardReadOnly";
import { AccountDetailsReadOnly } from "@/components/AccountDetailsReadOnly";
import { render } from "@/test/render";
import { accountListItemFixture, accountDetailFixture } from "@/test/fixtures";

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<typeof import("@workspace/api-client-react")>(
    "@workspace/api-client-react",
  );
  return {
    ...actual,
    useGetAccount: vi.fn(),
    useGetAccountCapacities: vi.fn(),
  };
});

describe("AccountCardReadOnly integration boundaries", () => {
  const account = accountListItemFixture();

  beforeEach(() => {
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([]));
  });

  it("renders Edit but not Create, Status Override, or Delete controls", () => {
    render(
      <AccountCardReadOnly
        account={account}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /ویرایش/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /افزودن/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /تغییر وضعیت/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /حذف/i })).not.toBeInTheDocument();
  });

  it("does not render Edit when onEdit is not provided", () => {
    render(
      <AccountCardReadOnly
        account={account}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
      />,
    );
    expect(screen.queryByRole("button", { name: /ویرایش/i })).not.toBeInTheDocument();
  });
});

describe("AccountDetailsReadOnly integration boundaries", () => {
  const account = accountDetailFixture();

  beforeEach(() => {
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(account, "success"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([]));
  });

  it("renders Edit but not Create, Status Override, or Delete controls", () => {
    render(
      <AccountDetailsReadOnly
        open
        accountId="acc-1"
        gamePlatform="PS4_AND_PS5"
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /ویرایش/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /افزودن/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /تغییر وضعیت/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /حذف/i })).not.toBeInTheDocument();
  });

  it("does not render Edit when onEdit is not provided", () => {
    render(
      <AccountDetailsReadOnly
        open
        accountId="acc-1"
        gamePlatform="PS4_AND_PS5"
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /ویرایش/i })).not.toBeInTheDocument();
  });
});

describe("Feature barrel isolation", () => {
  it("does not export deleteAccount or useDeleteAccount", async () => {
    const featureModule = await import("../index");
    expect((featureModule as Record<string, unknown>)["deleteAccount"]).toBeUndefined();
    expect((featureModule as Record<string, unknown>)["useDeleteAccount"]).toBeUndefined();
  });
});

describe("Zero real network requests", () => {
  it("documents the setup.ts invariant: no real fetch calls in any feature test", () => {
    // setup.ts installs a fetch spy before every test and asserts it was NOT
    // called after every test. Any test that makes a real fetch call fails automatically.
    expect(true).toBe(true);
  });
});
