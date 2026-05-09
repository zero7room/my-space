import createClient from "openapi-fetch";

import type { paths } from "@/lib/api/schema";
import { serverApiBaseUrl } from "@/lib/api/server-config";
import { mockPingResponse } from "@/lib/mocks/fixtures";

export type PingResponse =
  paths["/api/v1/ping"]["get"]["responses"][200]["content"]["application/json"];

export type PingViewModel = PingResponse & {
  source: "api" | "server-fixture" | "fallback";
};

const client = createClient<paths>({
  baseUrl: serverApiBaseUrl,
});

export async function getPing(): Promise<PingViewModel> {
  if (process.env.NEXT_PUBLIC_API_MOCKING === "enabled") {
    return {
      ...mockPingResponse,
      source: "server-fixture",
    };
  }

  try {
    const { data, error } = await client.GET("/api/v1/ping");

    if (error || !data) {
      throw new Error("Ping endpoint returned no data.");
    }

    return {
      ...data,
      source: "api",
    };
  } catch {
    return {
      ok: false,
      message: "backend offline",
      source: "fallback",
    };
  }
}
