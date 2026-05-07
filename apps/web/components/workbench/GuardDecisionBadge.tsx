'use client';
import * as React from 'react';
import { cn } from '../../lib/cn';

export type GuardDecision = {
  intent: string;
  shortCircuited: boolean;
  confidence: number;
  ruleHits?: string[];
  reason?: string;
};

export function GuardDecisionBadge(props: {
  decision: GuardDecision;
}): React.JSX.Element {
  const { decision } = props;
  const pct = Math.round(
    Math.max(0, Math.min(1, decision.confidence)) * 100,
  );
  return (
    <div
      className={cn(
        'mt-2 inline-flex max-w-full flex-col gap-1 rounded-card border border-border bg-surface-raised px-3 py-2 text-xs shadow-soft',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="u-label">Guard</span>
        <span className="font-semibold text-foreground">{decision.intent}</span>
        {decision.shortCircuited ? (
          <span className="rounded-pill bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
            SHORT
          </span>
        ) : null}
        <span className="text-muted">{pct}%</span>
      </div>
      {decision.ruleHits && decision.ruleHits.length > 0 ? (
        <div className="text-[11px] text-muted">
          {decision.ruleHits.join(', ')}
        </div>
      ) : null}
      {decision.reason ? (
        <div className="text-sm text-muted">{decision.reason}</div>
      ) : null}
    </div>
  );
}
