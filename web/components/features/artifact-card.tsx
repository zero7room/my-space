import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { RelationGraph } from "@/components/charts/relation-graph";
import { ScoreRadar } from "@/components/charts/score-radar";
import { Button } from "@/components/ui/button";
import { getLocalLeaderStocks } from "@/lib/app/api";
import type { Artifact } from "@/lib/app/types";

const relationLabel: Record<Artifact["conclusions"][number]["relationClass"], string> = {
  fact: "事实",
  statistical: "统计",
  inferred: "推断",
};

export function ArtifactCard({ artifact, compact = false }: { artifact: Artifact; compact?: boolean }) {
  const [leaderStock] = getLocalLeaderStocks();

  return (
    <article className="border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            {artifact.skill} · {artifact.asOf}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{artifact.title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{artifact.summary}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/artifacts/${artifact.runId}`}>全屏</Link>
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {artifact.highlights.map((highlight) => (
          <span key={highlight} className="border bg-accent px-2 py-1 text-xs text-accent-foreground">
            {highlight}
          </span>
        ))}
      </div>

      {!compact && (
        <div className="mt-5 space-y-5">
          {artifact.charts.some((chart) => chart.kind === "radar") && (
            <ScoreRadar data={leaderStock.scoreBreakdown} />
          )}
          {artifact.graph && (
            <RelationGraph
              nodes={artifact.graph.nodes}
              edges={artifact.graph.edges}
              title={artifact.charts.some((chart) => chart.kind === "network") ? "跨市场影响图" : "产业链图"}
            />
          )}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {artifact.conclusions.map((conclusion) => (
          <details key={conclusion.id} className="border bg-background p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {relationLabel[conclusion.relationClass]} · {Math.round(conclusion.confidence * 100)}% ·{" "}
              {conclusion.text}
            </summary>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {conclusion.evidence.map((evidence) => (
                <li key={evidence}>
                  <Link
                    href={`/artifacts/${artifact.runId}?evidence=${encodeURIComponent(evidence)}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink aria-hidden="true" className="size-3" />
                    {evidence}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </article>
  );
}
