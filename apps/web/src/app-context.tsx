import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { type ApiClient, createApiClient } from "./api/client.js";

type AppCtx = {
  client: ApiClient;
  adminToken: string;
  setAdminToken(t: string): void;
  baseUrl: string;
};

const Ctx = createContext<AppCtx | null>(null);

export function AppContextProvider({ children }: { children: ReactNode }) {
  const [adminToken, setAdminTokenState] = useState<string>(() =>
    typeof localStorage !== "undefined" ? (localStorage.getItem("adminToken") ?? "") : "",
  );
  const baseUrl = "";
  const client = useMemo(() => createApiClient({ baseUrl, adminToken }), [adminToken]);
  function setAdminToken(t: string) {
    setAdminTokenState(t);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("adminToken", t);
    }
  }
  return (
    <Ctx.Provider value={{ client, adminToken, setAdminToken, baseUrl }}>{children}</Ctx.Provider>
  );
}

export function useAppContext(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppContext outside provider");
  return ctx;
}
