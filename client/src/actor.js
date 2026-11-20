import { createContext, useContext } from "react";
import { api } from "./api";

export const ActorContext = createContext("human");

export function useActor() {
  return useContext(ActorContext);
}

export async function syncActor() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("as");
  if (requested === "agent" || requested === "human") {
    await api("/api/session", { method: "POST", body: JSON.stringify({ actor: requested }) });
    params.delete("as");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
  }
  const data = await api("/api/session");
  return data.actor === "agent" ? "agent" : "human";
}
