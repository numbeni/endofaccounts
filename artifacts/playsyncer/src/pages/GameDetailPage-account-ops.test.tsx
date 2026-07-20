import { vi, describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import GameDetailPage from "./GameDetailPage";
import {
  useListAccounts,
  useGetAccount,
  useGetAccountCapacities,
  useCreateAccount,
  useUpdateAccount,
  getListAccountsQueryKey,
  getGetAccountQueryKey,
} from "@workspace/api-client-react";
import { useGames } from "@/hooks/useGames";
import { mockListAccounts, mockAccountDetail, mockCapacities } from "@/test/mocks";
import { render } from "@/test/render";
import { gameFixture, accountListItemFixture, accountDetailFixture } from "@/test/fixtures";
import { useQueryClient } from "@tanstack/react-query";
import type { AccountListItem } from "@workspace/api-client-react";

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

vi.mock("@/features/account-write", async () => {
  return {
    CreateAccountDialog: (props: {
      open: boolean;
      gameId: string;
      onSuccess: () => void;
      onClose: () => void;
    }) => {
      if (!props.open) return null;
      return (
        <div role="dialog" aria-label="create-account-dialog">
          <p>افزودن اکانت جدید</p>
          <button onClick={props.onSuccess}>Success</button>
          <button onClick={props.onClose}>Close</button>
        </div>
      );
    },
    EditAccountDialog: (props: {
      open: boolean;
      account: AccountListItem | null;
      onSuccess: () => void;
      onClose: () => void;
    }) => {
      if (!props.open) return null;
      return (
        <div role="dialog" aria-label="edit-account-dialog">
          <p>ویرایش اکانت</p>
          <p data-testid="edit-account-id">{props.account?.id ?? "none"}</p>
          <button onClick={props.onSuccess}>Success</button>
          <button onClick={props.onClose}>Close</button>
        </div>
      );
    },
  };
});

let invalidateQueries: ReturnType<typeof vi.fn>;

function makeMutation(): any {
  return {
    mutateAsync: vi.fn().mockResolvedValue({ account: accountDetailFixture() }),
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

function mockGamesContext() {
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
  } as unknown as ReturnType<typeof useGames>);
}

function renderGameDetail() {
  return render(
    <Routes>
      <Route path="/games/:gameId" element={<GameDetailPage />} />
    </Routes>,
    { initialRoute: "/games/game-1" },
  );
}

describe("GameDetailPage Account operations wiring", () => {
  beforeEach(() => {
    invalidateQueries = vi.fn();
    vi.mocked(useQueryClient).mockReturnValue({
      invalidateQueries,
    } as unknown as ReturnType<typeof useQueryClient>);

    vi.mocked(useGetAccount).mockReturnValue(
      mockAccountDetail(accountDetailFixture(), "success"),
    );
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
    vi.mocked(useCreateAccount).mockReturnValue(makeMutation());
    vi.mocked(useUpdateAccount).mockReturnValue(makeMutation());
  });

  it("passes the current gameId to CreateAccountDialog", () => {
    mockGamesContext();
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts([], "success"));
    renderGameDetail();
    fireEvent.click(screen.getByRole("button", { name: /افزودن اکانت/i }));
    expect(screen.getByRole("dialog", { name: "create-account-dialog" })).toBeInTheDocument();
    expect(screen.getByText("افزودن اکانت جدید")).toBeInTheDocument();
  });

  it("invalidates the account list query after create success", () => {
    mockGamesContext();
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts([], "success"));
    renderGameDetail();
    fireEvent.click(screen.getByRole("button", { name: /افزودن اکانت/i }));
    fireEvent.click(screen.getByText("Success"));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: getListAccountsQueryKey("game-1"),
    });
  });

  it("closes the create dialog via onClose", () => {
    mockGamesContext();
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts([], "success"));
    renderGameDetail();
    fireEvent.click(screen.getByRole("button", { name: /افزودن اکانت/i }));
    fireEvent.click(screen.getByText("Close"));
    expect(screen.queryByRole("dialog", { name: "create-account-dialog" })).not.toBeInTheDocument();
  });

  it("passes the selected account to EditAccountDialog", () => {
    mockGamesContext();
    const accounts = [accountListItemFixture({ id: "acc-1", displayNumber: "TEST-001" })];
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
    renderGameDetail();
    fireEvent.click(screen.getByRole("button", { name: /ویرایش اکانت/i }));
    expect(screen.getByTestId("edit-account-id")).toHaveTextContent("acc-1");
  });

  it("invalidates the account list and detail queries after edit success", () => {
    mockGamesContext();
    const accounts = [accountListItemFixture({ id: "acc-1", displayNumber: "TEST-001" })];
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
    renderGameDetail();
    fireEvent.click(screen.getByRole("button", { name: /ویرایش اکانت/i }));
    fireEvent.click(screen.getByText("Success"));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: getListAccountsQueryKey("game-1"),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: getGetAccountQueryKey("acc-1"),
    });
  });

  it("closes the edit dialog via onClose", () => {
    mockGamesContext();
    const accounts = [accountListItemFixture({ id: "acc-1", displayNumber: "TEST-001" })];
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
    renderGameDetail();
    fireEvent.click(screen.getByRole("button", { name: /ویرایش اکانت/i }));
    fireEvent.click(screen.getByText("Close"));
    expect(screen.queryByRole("dialog", { name: "edit-account-dialog" })).not.toBeInTheDocument();
  });

  it("invalidates the detail query when editing from the detail modal", () => {
    mockGamesContext();
    const accounts = [accountListItemFixture({ id: "acc-1", displayNumber: "TEST-001" })];
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(accountDetailFixture(), "success"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
    renderGameDetail();
    fireEvent.click(screen.getByLabelText("مشاهده جزئیات اکانت"));
    // The detail modal and the card both have an edit button; use the modal one.
    const editButtons = screen.getAllByRole("button", { name: /ویرایش اکانت/i });
    fireEvent.click(editButtons[editButtons.length - 1]);
    fireEvent.click(screen.getByText("Success"));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: getListAccountsQueryKey("game-1"),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: getGetAccountQueryKey("acc-1"),
    });
  });
});
