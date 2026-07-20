import { useContext } from "react";
import { GamesContext, type GamesContextValue } from "./gamesContext";

export function useGames(): GamesContextValue {
  const ctx = useContext(GamesContext);
  if (!ctx) throw new Error("useGames must be used inside <GamesProvider>");
  return ctx;
}
