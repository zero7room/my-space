from datetime import UTC, datetime
from time import perf_counter
from typing import Literal

from pydantic import BaseModel, Field

TaskKind = Literal["extract", "summarize", "qa", "report"]
LatencyBudget = Literal["low", "normal", "high"]


class LLMRunLimitExceeded(RuntimeError):
    pass


class LLMMessage(BaseModel):
    role: str
    content: str


class LLMResponse(BaseModel):
    run_id: str
    provider: str
    model: str
    content: str
    prompt_tokens: int
    completion_tokens: int
    latency_ms: int
    prompt_cache_key: str | None = None
    cache_hit: bool = False


class LLMTraceEvent(BaseModel):
    run_id: str
    provider: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    latency_ms: int
    prompt_cache_key: str | None = None
    cache_hit: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ProviderStub(BaseModel):
    name: str
    models: dict[TaskKind, str]

    def complete(
        self,
        *,
        run_id: str,
        task_kind: TaskKind,
        prompt_tokens: int,
        prompt_cache_key: str | None,
        cache_hit: bool,
        latency_ms: int,
    ) -> LLMResponse:
        return LLMResponse(
            run_id=run_id,
            provider=self.name,
            model=self.models[task_kind],
            content=f"[mock:{self.name}] {task_kind} response",
            prompt_tokens=prompt_tokens,
            completion_tokens=24,
            latency_ms=latency_ms,
            prompt_cache_key=prompt_cache_key,
            cache_hit=cache_hit,
        )


class LLMGateway:
    def __init__(self, *, max_calls: int = 8, max_tokens: int = 8000) -> None:
        self.max_calls = max_calls
        self.max_tokens = max_tokens
        self.trace: list[LLMTraceEvent] = []
        self._run_calls: dict[str, int] = {}
        self._run_tokens: dict[str, int] = {}
        self._prompt_cache: set[str] = set()
        self._providers = {
            "openai": ProviderStub(
                name="openai",
                models={
                    "extract": "gpt-4.1-mini",
                    "summarize": "gpt-4.1-mini",
                    "qa": "gpt-4.1",
                    "report": "gpt-4.1",
                },
            ),
            "anthropic": ProviderStub(
                name="anthropic",
                models={
                    "extract": "claude-haiku",
                    "summarize": "claude-haiku",
                    "qa": "claude-sonnet",
                    "report": "claude-opus",
                },
            ),
            "deepseek": ProviderStub(
                name="deepseek",
                models={
                    "extract": "deepseek-v3",
                    "summarize": "deepseek-v3",
                    "qa": "deepseek-chat",
                    "report": "deepseek-reasoner",
                },
            ),
            "tongyi": ProviderStub(
                name="tongyi",
                models={
                    "extract": "qwen-plus",
                    "summarize": "qwen-plus",
                    "qa": "qwen-max",
                    "report": "qwen-max",
                },
            ),
            "zhipu": ProviderStub(
                name="zhipu",
                models={
                    "extract": "glm-4-air",
                    "summarize": "glm-4-air",
                    "qa": "glm-4-plus",
                    "report": "glm-4-plus",
                },
            ),
        }

    def complete(
        self,
        *,
        run_id: str,
        task_kind: TaskKind,
        latency_budget: LatencyBudget,
        messages: list[dict[str, str] | LLMMessage],
        tools: list[dict[str, object]] | None = None,
        stream: bool = False,
        prompt_cache_key: str | None = None,
    ) -> LLMResponse:
        del tools, stream
        cache_hit = prompt_cache_key in self._prompt_cache if prompt_cache_key else False
        provider = self._route(task_kind=task_kind, latency_budget=latency_budget)
        raw_prompt_tokens = self._estimate_tokens(messages)
        prompt_tokens = self._cache_adjusted_tokens(raw_prompt_tokens, cache_hit=cache_hit)
        self._check_limits(
            run_id=run_id,
            next_tokens=prompt_tokens,
            prompt_cache_key=prompt_cache_key,
            cache_hit=cache_hit,
        )

        start = perf_counter()
        if prompt_cache_key:
            self._prompt_cache.add(prompt_cache_key)
        latency_ms = max(1, int((perf_counter() - start) * 1000))

        response = provider.complete(
            run_id=run_id,
            task_kind=task_kind,
            prompt_tokens=prompt_tokens,
            prompt_cache_key=prompt_cache_key,
            cache_hit=cache_hit,
            latency_ms=latency_ms,
        )
        self._record(response)
        return response

    def _route(self, *, task_kind: TaskKind, latency_budget: LatencyBudget) -> ProviderStub:
        if task_kind in {"extract", "summarize"}:
            return self._providers["deepseek"]
        if task_kind == "report" or latency_budget == "high":
            return self._providers["openai"]
        return self._providers["anthropic"]

    def _check_limits(
        self,
        *,
        run_id: str,
        next_tokens: int,
        prompt_cache_key: str | None,
        cache_hit: bool,
    ) -> None:
        calls = self._run_calls.get(run_id, 0)
        tokens = self._run_tokens.get(run_id, 0)
        if calls + 1 > self.max_calls:
            self._record_limit_event(
                run_id=run_id,
                prompt_tokens=next_tokens,
                prompt_cache_key=prompt_cache_key,
                cache_hit=cache_hit,
            )
            raise LLMRunLimitExceeded(f"Run {run_id} exceeded max LLM calls")
        if tokens + next_tokens > self.max_tokens:
            self._record_limit_event(
                run_id=run_id,
                prompt_tokens=next_tokens,
                prompt_cache_key=prompt_cache_key,
                cache_hit=cache_hit,
            )
            raise LLMRunLimitExceeded(f"Run {run_id} exceeded max LLM tokens")
        self._run_calls[run_id] = calls + 1
        self._run_tokens[run_id] = tokens + next_tokens

    def _record_limit_event(
        self,
        *,
        run_id: str,
        prompt_tokens: int,
        prompt_cache_key: str | None,
        cache_hit: bool,
    ) -> None:
        self.trace.append(
            LLMTraceEvent(
                run_id=run_id,
                provider="limit",
                model="limit",
                prompt_tokens=prompt_tokens,
                completion_tokens=0,
                latency_ms=0,
                prompt_cache_key=prompt_cache_key,
                cache_hit=cache_hit,
            )
        )

    def _record(self, response: LLMResponse) -> None:
        self.trace.append(
            LLMTraceEvent(
                run_id=response.run_id,
                provider=response.provider,
                model=response.model,
                prompt_tokens=response.prompt_tokens,
                completion_tokens=response.completion_tokens,
                latency_ms=response.latency_ms,
                prompt_cache_key=response.prompt_cache_key,
                cache_hit=response.cache_hit,
            )
        )

    @staticmethod
    def _estimate_tokens(messages: list[dict[str, str] | LLMMessage]) -> int:
        total_chars = 0
        for message in messages:
            content = (
                message.content if isinstance(message, LLMMessage) else message.get("content", "")
            )
            total_chars += len(content)
        return max(1, total_chars // 2)

    @staticmethod
    def _cache_adjusted_tokens(prompt_tokens: int, *, cache_hit: bool) -> int:
        if not cache_hit:
            return prompt_tokens
        return max(1, prompt_tokens // 4)
