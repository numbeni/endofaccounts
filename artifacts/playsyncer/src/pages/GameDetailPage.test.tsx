import { vi, describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Routes, Route, useNavigate } from "react-router-dom";
import GameDetailPage from "./GameDetailPage";
import {
  useListAccounts,
  useGetAccount,
  useGetAccountCapacities,
  useCreateAccount,
  useUpdateAccount,
} from "@workspace/api-client-react";
import { useGames } from "@/hooks/useGames";
import { mockListAccounts, mockAccountDetail, mockCapacities } from "@/test/mocks";
import { render } from "@/test/render";
import { gameFixture, accountListItemFixture, accountDetailFixture, accountCapacityFixture } from "@/test/fixtures";
import { AccountStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { accountMutationsEnabled, PERSIAN_INACTIVE_GAME_CREATE_DISABLED } from "@/features/account-write/accountMutationsEnabled";

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<typeof import("@workspace/api-client-react")>(
    "@workspace/api-client-react",
  );
  return {
    ...actual,
    useListAccounts: vi.fn(),
    useGetAccount: vi.fn(),
    useGetAccountCapacities: vi.fn(),
    useCreateAccount: vi.fn(),
    useUpdateAccount: vi.fn(),
  };
});

vi.mock("@/hooks/useGames", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useGames")>("@/hooks/useGames");
  return {
    ...actual,
    useGames: vi.fn(),
  };
});

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: vi.fn(),
  };
});

vi.mock("@/features/account-write/accountMutationsEnabled", () => ({
  accountMutationsEnabled: vi.fn().mockReturnValue(true),
  PERSIAN_INACTIVE_GAME_CREATE_DISABLED: "بازی غیرفعال است. برای افزودن اکانت، ابتدا بازی را فعال کنید.",
}));

function createApiError(message: string, status: number): Error & { status: number; data: unknown } {
  const err = new Error(message) as Error & { status: number; data: unknown };
  err.status = status;
  err.data = { error: message };
  return err;
}

function makeMutation(mutateAsync: () => Promise<unknown> = () => Promise.resolve()): any {
  return {
    mutateAsync,
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    data: undefined,
    error: null,
    reset: vi.fn(),
    variables: undefined,
    status: "idle" as const,
    submittedAt: 0,
    failureCount: 0,
    failureReason: null,
    context: undefined,
    isPaused: false,
  };
}

function RoutedGameDetailPage() {
  return (
    <Routes>
      <Route path="/games/:gameId" element={<GameDetailPage />} />
      <Route path="*" element={<div data-testid="not-found">Not Found</div>} />
    </Routes>
  );
}

function NavigableGameDetailPage() {
  const navigate = useNavigate();
  return (
    <>
      <button data-testid="navigate" onClick={() => navigate("/games/game-2")}>
        Go to game-2
      </button>
      <Routes>
        <Route path="/games/:gameId" element={<GameDetailPage />} />
      </Routes>
    </>
  );
}

function mockGamesContext(overrides?: Partial<ReturnType<typeof useGames>>) {
  vi.mocked(useGames).mockReturnValue({
    games: [gameFixture],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    mutations: {
      addGame: vi.fn(),
      editGame: vi.fn(),
      toggleGameStatus: vi.fn(),
      deleteGame: vi.fn(),
    },
    ...overrides,
  } as unknown as ReturnType<typeof useGames>);
}

function renderGameDetail(initialRoute: string) {
  return render(<RoutedGameDetailPage />, {
    initialRoute,
  });
}

describe("GameDetailPage Account workspace", () => {
  let invalidateQueries: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invalidateQueries = vi.fn();
    vi.mocked(useQueryClient).mockReturnValue({ invalidateQueries } as unknown as ReturnType<typeof useQueryClient>);

    vi.mocked(useGetAccount).mockReturnValue(
      mockAccountDetail(accountDetailFixture(), "success"),
    );
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
    vi.mocked(useCreateAccount).mockReturnValue(makeMutation());
    vi.mocked(useUpdateAccount).mockReturnValue(makeMutation());
  });

  it("renders Account list loading", () => {
    mockGamesContext();
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts([], "loading"));
    renderGameDetail("/games/game-1");
    expect(screen.getByText("در حال دریافت اکانت‌ها…")).toBeInTheDocument();
  });

  it("renders successful Account list", () => {
    mockGamesContext();
    const accounts = [
      accountListItemFixture({ id: "acc-1", displayNumber: "TEST-001", accountCode: "ACC-000001", status: AccountStatus.AVAILABLE }),
      accountListItemFixture({ id: "acc-2", displayNumber: "TEST-002", accountCode: "ACC-000002", status: AccountStatus.SOLD }),
    ];
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
    renderGameDetail("/games/game-1");
    const accountNumbers = screen.getAllByTitle("کلیک برای کپی شماره اکانت");
    expect(accountNumbers[0]).toHaveTextContent("TEST-001");
    expect(accountNumbers[1]).toHaveTextContent("TEST-002");
  });

  it("renders empty Account list", () => {
    mockGamesContext();
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts([], "success"));
    renderGameDetail("/games/game-1");
    expect(screen.getByText("هنوز اکانتی برای این بازی ثبت نشده است.")).toBeInTheDocument();
  });

  it("shows a Game-related 404 error message for Account list failure", () => {
    mockGamesContext();
    vi.mocked(useListAccounts).mockReturnValue(
      mockListAccounts([], "error", createApiError("not found", 404)),
    );
    renderGameDetail("/games/game-1");
    expect(screen.getByText(/بازی مورد نظر یافت نشد/)).toBeInTheDocument();
  });

  it("calls retry on Account list failure", () => {
    mockGamesContext();
    const result = mockListAccounts([], "error", createApiError("network error", 500));
    vi.mocked(useListAccounts).mockReturnValue(result);
    renderGameDetail("/games/game-1");
    fireEvent.click(screen.getByText("تلاش مجدد"));
    expect(result.refetch).toHaveBeenCalled();
  });

  it("calls manual refresh on demand", () => {
    mockGamesContext();
    const result = mockListAccounts([], "success");
    vi.mocked(useListAccounts).mockReturnValue(result);
    renderGameDetail("/games/game-1");
    fireEvent.click(screen.getByText("بروزرسانی"));
    expect(result.refetch).toHaveBeenCalled();
  });

  it("uses accounts.length after successful loading", () => {
    mockGamesContext();
    const accounts = [
      accountListItemFixture({ id: "acc-1" }),
      accountListItemFixture({ id: "acc-2" }),
    ];
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
    renderGameDetail("/games/game-1");
    expect(screen.getByText("۲")).toBeInTheDocument();
  });

  it("does not show a false zero Account count when the API fails", () => {
    mockGamesContext();
    vi.mocked(useListAccounts).mockReturnValue(
      mockListAccounts([], "error", createApiError("network error", 500)),
    );
    renderGameDetail("/games/game-1");
    expect(screen.queryByText("۰")).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("opens the Account detail modal", () => {
    mockGamesContext();
    const accounts = [accountListItemFixture({ id: "acc-1", displayNumber: "TEST-001" })];
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(accountDetailFixture(), "success"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
    renderGameDetail("/games/game-1");
    fireEvent.click(screen.getByLabelText("مشاهده جزئیات اکانت"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes the open Account detail modal when gameId changes", async () => {
    mockGamesContext();
    const accounts = [accountListItemFixture({ id: "acc-1", displayNumber: "TEST-001" })];
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(accountDetailFixture(), "success"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
    render(<NavigableGameDetailPage />, { initialRoute: "/games/game-1" });
    fireEvent.click(screen.getByLabelText("مشاهده جزئیات اکانت"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("navigate"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not retain previous Game Account detail", () => {
    mockGamesContext({ games: [{ ...gameFixture, id: "game-2", coverUrl: "https://example.com/cover.jpg", accountCount: 0 }] });
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts([], "success"));
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(accountDetailFixture(), "success"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
    renderGameDetail("/games/game-2");
    expect(screen.queryByText("TEST-001")).not.toBeInTheDocument();
  });

  it("renders Add Account and Edit controls but not Delete or Status Override", () => {
    mockGamesContext();
    const accounts = [accountListItemFixture({ id: "acc-1", displayNumber: "TEST-001" })];
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
    renderGameDetail("/games/game-1");
    expect(screen.getByRole("button", { name: /افزودن اکانت/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ویرایش اکانت/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /حذف اکانت/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /تغییر وضعیت اکانت/i })).not.toBeInTheDocument();
  });

  it("does not mount legacy mutation components in the active path", () => {
    mockGamesContext();
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts([], "success"));
    renderGameDetail("/games/game-1");
    // The legacy AccountFormModal and AccountCard (mutation version) are not imported in the active path.
    expect(screen.queryByText(/Backup Code/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/وضعیت اکانت/i)).not.toBeInTheDocument();
  });

  describe("Create Account integration", () => {
    it("opens CreateAccountDialog when Add Account is clicked", () => {
      mockGamesContext();
      vi.mocked(useListAccounts).mockReturnValue(mockListAccounts([], "success"));
      renderGameDetail("/games/game-1");
      fireEvent.click(screen.getByRole("button", { name: /افزودن اکانت/i }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("افزودن اکانت جدید")).toBeInTheDocument();
    });
  });

  describe("Edit Account integration", () => {
    it("opens EditAccountDialog from the account card edit button", () => {
      mockGamesContext();
      const accounts = [accountListItemFixture({ id: "acc-1", displayNumber: "TEST-001" })];
      vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
      renderGameDetail("/games/game-1");
      fireEvent.click(screen.getByRole("button", { name: /ویرایش اکانت/i }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("ویرایش اکانت")).toBeInTheDocument();
    });

    it("opens EditAccountDialog from the account details modal", () => {
      mockGamesContext();
      const accounts = [accountListItemFixture({ id: "acc-1", displayNumber: "TEST-001" })];
      vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
      vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(accountDetailFixture(), "success"));
      vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
      renderGameDetail("/games/game-1");
      fireEvent.click(screen.getByLabelText("مشاهده جزئیات اکانت"));
      fireEvent.click(screen.getAllByRole("button", { name: /ویرایش اکانت/i })[0]);
      expect(screen.getByText("ویرایش اکانت")).toBeInTheDocument();
    });

    it("closes the detail modal before opening EditAccountDialog", () => {
      mockGamesContext();
      const accounts = [accountListItemFixture({ id: "acc-1", displayNumber: "TEST-001" })];
      vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
      vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(accountDetailFixture(), "success"));
      vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
      renderGameDetail("/games/game-1");
      fireEvent.click(screen.getByLabelText("مشاهده جزئیات اکانت"));
      const detailModal = screen.getByRole("dialog");
      fireEvent.click(screen.getAllByRole("button", { name: /ویرایش اکانت/i })[0]);
      // The detail modal should be replaced by the edit dialog; the same dialog role remains.
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.queryByText("جزئیات اکانت")).not.toBeInTheDocument();
    });
  });

  describe("Account mutation runtime gate", () => {
    it("hides Add and Edit controls when account mutations are disabled", () => {
      vi.mocked(accountMutationsEnabled).mockReturnValue(false);
      mockGamesContext();
      const accounts = [accountListItemFixture({ id: "acc-1", displayNumber: "TEST-001" })];
      vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
      renderGameDetail("/games/game-1");
      expect(screen.queryByRole("button", { name: /افزودن اکانت/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /ویرایش اکانت/i })).not.toBeInTheDocument();
    });
  });

  describe("Inactive Game behavior", () => {
    it("disables Add Account and shows a safe Persian explanation", () => {
      mockGamesContext({ games: [{ ...gameFixture, coverUrl: "https://example.com/cover.jpg", status: "INACTIVE" }] });
      vi.mocked(useListAccounts).mockReturnValue(mockListAccounts([], "success"));
      renderGameDetail("/games/game-1");
      const addButton = screen.getByRole("button", { name: /افزودن اکانت/i });
      expect(addButton).toBeDisabled();
      expect(screen.getByText(PERSIAN_INACTIVE_GAME_CREATE_DISABLED)).toBeInTheDocument();
    });
  });

  describe("Cross-Game state safety", () => {
    it("closes Create and Edit dialogs and clears selected account IDs when gameId changes", async () => {
      mockGamesContext();
      const accounts = [accountListItemFixture({ id: "acc-1", displayNumber: "TEST-001" })];
      vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
      render(<NavigableGameDetailPage />, { initialRoute: "/games/game-1" });

      // Open create dialog and select an account for edit.
      fireEvent.click(screen.getByRole("button", { name: /افزودن اکانت/i }));
      fireEvent.click(screen.getByRole("button", { name: /ویرایش اکانت/i }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      // Navigate to a different Game.
      fireEvent.click(screen.getByTestId("navigate"));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
  });
});
