import { vi, describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import GamesPage from "./GamesPage";
import { useGames } from "@/hooks/useGames";
import { render } from "@/test/render";
import { gameFixture } from "@/test/fixtures";

vi.mock("@/hooks/useGames", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useGames")>("@/hooks/useGames");
  return {
    ...actual,
    useGames: vi.fn(),
  };
});

function createApiError(message: string, status: number): Error & { status: number; data: unknown } {
  const err = new Error(message) as Error & { status: number; data: unknown };
  err.status = status;
  err.data = { error: message };
  return err;
}

function RoutedGamesPage() {
  return (
    <Routes>
      <Route path="/" element={<GamesPage />} />
    </Routes>
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

describe("GamesPage", () => {
  beforeEach(() => {
    mockGamesContext();
  });

  it("renders the games list", () => {
    render(<RoutedGamesPage />, { initialRoute: "/" });
    expect(screen.getByText("بازی‌ها")).toBeInTheDocument();
    expect(screen.getByText(gameFixture.title)).toBeInTheDocument();
  });

  it("never renders raw error.message", () => {
    const rawMessage = "RAW_SECRET_ERROR_MESSAGE_9472";
    mockGamesContext({
      isLoading: false,
      isError: true,
      error: createApiError(rawMessage, 500),
    });
    render(<RoutedGamesPage />, { initialRoute: "/" });
    expect(screen.queryByText(rawMessage)).not.toBeInTheDocument();
  });

  it("calls retry on error", () => {
    const refetch = vi.fn();
    mockGamesContext({
      isLoading: false,
      isError: true,
      error: createApiError("server failure", 500),
      refetch,
    });
    render(<RoutedGamesPage />, { initialRoute: "/" });
    fireEvent.click(screen.getByText("تلاش مجدد"));
    expect(refetch).toHaveBeenCalled();
  });
});
