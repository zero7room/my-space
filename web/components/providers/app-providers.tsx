"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_API_MOCKING !== "enabled") {
      return;
    }

    void import("@/lib/mocks/browser").then(({ worker }) => {
      void worker.start({
        onUnhandledRequest: "bypass",
      });
    });
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
