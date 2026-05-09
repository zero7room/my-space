from fastapi import APIRouter, Response

router = APIRouter(tags=["metrics"])


@router.get("/metrics")
async def metrics() -> Response:
    body = "\n".join(
        [
            "# HELP runs_total Skill runtime runs by final state.",
            "# TYPE runs_total counter",
            'runs_total{skill="demo",status="succeeded",trigger="api"} 0',
            "# HELP alerts_total Alert outcomes by priority, channel, and state.",
            "# TYPE alerts_total counter",
            'alerts_total{priority="high",channel="web",state="sent"} 0',
            "# HELP llm_tokens_total LLMGateway token usage.",
            "# TYPE llm_tokens_total counter",
            'llm_tokens_total{provider="stub",model="stub",task_kind="qa"} 0',
            "# HELP collector_failures_total Collector failures by source and error category.",
            "# TYPE collector_failures_total counter",
            'collector_failures_total{source="akshare",error_type="unknown"} 0',
            "",
        ]
    )
    return Response(content=body, media_type="text/plain; version=0.0.4")
