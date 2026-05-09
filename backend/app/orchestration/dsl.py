import operator
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field


class RuleCondition(BaseModel):
    metric: str
    subject: dict[str, str] = Field(default_factory=dict)
    changed_by: str | None = None
    changed: bool | None = None
    window: str | None = None
    cross_template: bool = False


class StrategyRule(BaseModel):
    id: str
    name: str
    conditions: list[RuleCondition]
    output: dict[str, Any] = Field(default_factory=dict)


@dataclass(frozen=True)
class RuleCandidate:
    rule_id: str
    priority: str
    message: str
    subject: dict[str, str]
    evidence: list[str]
    ctx: dict[str, Any]


class RuleParser:
    def parse(self, payload: dict[str, Any]) -> StrategyRule:
        condition = payload.get("condition", {})
        raw_conditions = condition.get("all_of") or condition.get("any_of") or [condition]
        return StrategyRule(
            id=payload["id"],
            name=payload.get("name", payload["id"]),
            conditions=[RuleCondition.model_validate(item) for item in raw_conditions],
            output=payload.get("output", {}),
        )


def evaluate_rule(rule: StrategyRule, facts: dict[str, Any]) -> RuleCandidate | None:
    metric_facts = facts.get("metrics", {})
    ctx: dict[str, Any] = {}
    evidence: list[str] = []
    subject: dict[str, str] = {}

    for condition in rule.conditions:
        metric = metric_facts.get(condition.metric)
        if not metric or not _matches_condition(condition, metric, ctx):
            return None
        subject = condition.subject
        if metric.get("evidence"):
            evidence.extend(metric["evidence"])

    return RuleCandidate(
        rule_id=rule.id,
        priority=str(rule.output.get("priority", "medium")),
        message=str(rule.output.get("message_template", rule.name)),
        subject=subject,
        evidence=evidence,
        ctx=ctx,
    )


def _matches_condition(
    condition: RuleCondition,
    metric: dict[str, Any],
    ctx: dict[str, Any],
) -> bool:
    current = metric.get("current", {})
    previous = metric.get("previous", {})
    current_version = current.get("weight_template_version")
    previous_version = previous.get("weight_template_version")

    if condition.metric.startswith("leader_score"):
        if current.get("baseline") and not condition.cross_template:
            return False
        if current_version != previous_version and not condition.cross_template:
            return False
        if current_version:
            ctx["weight_template_version"] = current_version

    if condition.changed is True and current.get("value") == previous.get("value"):
        return False

    if condition.changed_by:
        delta = float(current.get("value", 0)) - float(previous.get("value", 0))
        ctx["delta"] = delta
        return _compare(delta, condition.changed_by)

    return True


def _compare(value: float, expression: str) -> bool:
    operators = {
        ">=": operator.ge,
        "<=": operator.le,
        ">": operator.gt,
        "<": operator.lt,
        "==": operator.eq,
    }
    for prefix, op in operators.items():
        if expression.startswith(prefix):
            return bool(op(value, float(expression.removeprefix(prefix).strip())))
    return value >= float(expression)
