import { http, HttpResponse } from "msw";

import { browserApiBaseUrl } from "@/lib/api/browser-config";
import { alerts, artifacts, sectors, skills, stocks, strategies } from "@/lib/app/fixtures";
import { mockPingResponse } from "@/lib/mocks/fixtures";

export const handlers = [
  http.get(`${browserApiBaseUrl}/api/v1/ping`, () =>
    HttpResponse.json(mockPingResponse),
  ),
  http.get(`${browserApiBaseUrl}/api/v1/alerts`, ({ request }) => {
    const url = new URL(request.url);
    const strategyId = url.searchParams.get("strategy_id");
    return HttpResponse.json(
      strategyId ? alerts.filter((alert) => alert.strategyId === strategyId) : alerts,
    );
  }),
  http.get(`${browserApiBaseUrl}/api/v1/sectors/:id/latest`, ({ params }) =>
    sectors.find((sector) => sector.id === params.id)
      ? HttpResponse.json(sectors.find((sector) => sector.id === params.id))
      : HttpResponse.json({ detail: "Sector not found" }, { status: 404 }),
  ),
  http.get(`${browserApiBaseUrl}/api/v1/symbols/:code/latest`, ({ params }) =>
    stocks.find((stock) => stock.code === params.code)
      ? HttpResponse.json(stocks.find((stock) => stock.code === params.code))
      : HttpResponse.json({ detail: "Symbol not found" }, { status: 404 }),
  ),
  http.get(`${browserApiBaseUrl}/api/v1/artifacts/:runId`, ({ params }) =>
    artifacts.find((artifact) => artifact.runId === params.runId)
      ? HttpResponse.json(artifacts.find((artifact) => artifact.runId === params.runId))
      : HttpResponse.json({ detail: "Artifact not found" }, { status: 404 }),
  ),
  http.get(`${browserApiBaseUrl}/api/v1/strategies`, () => HttpResponse.json(strategies)),
  http.get(`${browserApiBaseUrl}/api/v1/strategies/:id`, ({ params }) =>
    strategies.find((strategy) => strategy.id === params.id)
      ? HttpResponse.json(strategies.find((strategy) => strategy.id === params.id))
      : HttpResponse.json({ detail: "Strategy not found" }, { status: 404 }),
  ),
  http.get(`${browserApiBaseUrl}/api/v1/skills`, () => HttpResponse.json(skills)),
];
