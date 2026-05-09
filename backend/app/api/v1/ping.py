from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1", tags=["system"])


class PingResponse(BaseModel):
    ok: bool
    message: str


@router.get("/ping", response_model=PingResponse)
async def ping() -> PingResponse:
    return PingResponse(ok=True, message="pong")
