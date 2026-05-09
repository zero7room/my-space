import { Link as LinkIcon } from "lucide-react";

import type { GraphEdge, GraphNode } from "@/lib/app/types";
import { cn } from "@/lib/utils";

const typeStyles: Record<GraphNode["type"], string> = {
  company: "border-primary bg-primary/10 text-primary",
  sector: "border-emerald-700 bg-emerald-50 text-emerald-800",
  product: "border-sky-700 bg-sky-50 text-sky-800",
  raw: "border-amber-700 bg-amber-50 text-amber-800",
  customer: "border-violet-700 bg-violet-50 text-violet-800",
  event: "border-destructive bg-destructive/10 text-destructive",
};

export function RelationGraph({
  nodes,
  edges,
  title,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  title: string;
}) {
  const center = nodes[Math.min(3, nodes.length - 1)];

  return (
    <div className="border bg-background p-4" aria-label={title}>
      <div className="grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{title}</h3>
            {center && (
              <span className="border bg-card px-2 py-1 text-xs text-muted-foreground">
                中心：{center.label}
              </span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2" aria-label="图谱节点">
            {nodes.map((node) => (
              <details key={node.id} className={cn("border px-3 py-2 text-sm", typeStyles[node.type])}>
                <summary className="cursor-pointer font-medium">{node.label}</summary>
                <EvidenceList evidence={node.evidence ?? [`node:${node.id}`]} />
              </details>
            ))}
          </div>
        </div>
        <div className="relative min-h-72 overflow-hidden border bg-card p-4">
          <div className="absolute inset-4">
            {edges.map((edge, index) => {
              const top = 18 + index * (64 / Math.max(edges.length - 1, 1));
              const opacity = edge.stale ? 0.35 : 0.85;
              const width = Math.max(2, Math.round(edge.strength * edge.confidence * 8));

              return (
                <div
                  key={edge.id}
                  className="absolute left-[18%] right-[18%] border-t border-primary"
                  style={{
                    top: `${top}%`,
                    borderWidth: width,
                    opacity,
                  }}
                />
              );
            })}
          </div>

          <div className="relative grid h-full grid-cols-[1fr_1fr] items-center gap-16">
            <div className="grid gap-3">
              {nodes.slice(0, Math.ceil(nodes.length / 2)).map((node) => (
                <div key={node.id} className={cn("border px-3 py-2 text-sm font-medium", typeStyles[node.type])}>
                  {node.label}
                </div>
              ))}
            </div>
            <div className="grid gap-3">
              {nodes.slice(Math.ceil(nodes.length / 2)).map((node) => (
                <div key={node.id} className={cn("border px-3 py-2 text-sm font-medium", typeStyles[node.type])}>
                  {node.label}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-2 md:col-span-2">
          {edges.map((edge) => {
            const source = nodes.find((node) => node.id === edge.source)?.label ?? edge.source;
            const target = nodes.find((node) => node.id === edge.target)?.label ?? edge.target;
            const width = Math.max(16, Math.round(edge.strength * edge.confidence * 100));

            return (
              <details
                key={edge.id}
                className={cn(
                  "border p-3 text-sm",
                  edge.stale ? "bg-muted text-muted-foreground" : "bg-card",
                )}
              >
                <summary className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="font-medium">
                    {source} → {target}
                  </span>
                  <span>{Math.round(edge.confidence * 100)}%</span>
                </summary>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-2 flex-1 bg-muted">
                    <div className="h-2 bg-primary" style={{ width: `${width}%` }} />
                  </div>
                  <span className="shrink-0 text-muted-foreground">{edge.label}</span>
                </div>
                <EvidenceList evidence={edge.evidence ?? [`edge:${edge.id}`]} />
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: string[] }) {
  return (
    <ul className="mt-3 space-y-1 text-xs">
      {evidence.map((item) => (
        <li key={item}>
          <a
            href={`/artifacts/run_cpo_leader_20260508?evidence=${encodeURIComponent(item)}`}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <LinkIcon aria-hidden="true" className="size-3" />
            {item}
          </a>
        </li>
      ))}
    </ul>
  );
}
