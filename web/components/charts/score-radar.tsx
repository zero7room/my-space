import type { ScoreBreakdown } from "@/lib/app/types";

export function ScoreRadar({ data }: { data: ScoreBreakdown[] }) {
  const points = data
    .map((item, index) => {
      const angle = -90 + (360 / data.length) * index;
      const radius = 18 + (item.score / 100) * 62;
      const x = 90 + Math.cos((angle * Math.PI) / 180) * radius;
      const y = 90 + Math.sin((angle * Math.PI) / 180) * radius;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <svg
        aria-label="五维评分雷达图"
        viewBox="0 0 180 180"
        role="img"
        className="h-56 w-full border bg-background"
      >
        {[30, 55, 80].map((radius) => (
          <circle
            key={radius}
            cx="90"
            cy="90"
            r={radius}
            className="fill-none stroke-border"
            strokeWidth="1"
          />
        ))}
        {data.map((item, index) => {
          const angle = -90 + (360 / data.length) * index;
          const x = 90 + Math.cos((angle * Math.PI) / 180) * 82;
          const y = 90 + Math.sin((angle * Math.PI) / 180) * 82;
          return (
            <line
              key={item.dimension}
              x1="90"
              y1="90"
              x2={x}
              y2={y}
              className="stroke-border"
              strokeWidth="1"
            />
          );
        })}
        <polygon points={points} className="fill-primary/20 stroke-primary" strokeWidth="2" />
      </svg>

      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.dimension}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{item.dimension}</span>
              <span className="text-muted-foreground">
                {item.score} · 权重 {item.weight}%
              </span>
            </div>
            <div className="mt-2 h-2 bg-muted">
              <div className="h-2 bg-primary" style={{ width: `${item.score}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
