from fastapi import APIRouter

from app.api.v1.schemas import AnalysisArtifactResponse
from app.skills.core import (
    leader_identification_artifact,
    long_term_value_artifact,
    market_overview_artifact,
    sector_center_artifact,
    supply_chain_artifact,
)

router = APIRouter(prefix="/api/v1/analysis", tags=["analysis"])


@router.get("/sectors/{sector_id}", response_model=AnalysisArtifactResponse)
async def get_sector_center(sector_id: str) -> AnalysisArtifactResponse:
    return AnalysisArtifactResponse.model_validate(sector_center_artifact(sector_id).model_dump())


@router.get("/sectors/{sector_id}/leaders", response_model=AnalysisArtifactResponse)
async def get_sector_leaders(sector_id: str) -> AnalysisArtifactResponse:
    artifact = leader_identification_artifact(sector_id)
    return AnalysisArtifactResponse.model_validate(artifact.model_dump())


@router.get("/symbols/{symbol}/value", response_model=AnalysisArtifactResponse)
async def get_symbol_value(symbol: str) -> AnalysisArtifactResponse:
    return AnalysisArtifactResponse.model_validate(long_term_value_artifact(symbol).model_dump())


@router.get("/market/overview", response_model=AnalysisArtifactResponse)
async def get_market_overview() -> AnalysisArtifactResponse:
    return AnalysisArtifactResponse.model_validate(market_overview_artifact().model_dump())


@router.get("/symbols/{symbol}/supply-chain", response_model=AnalysisArtifactResponse)
async def get_supply_chain(symbol: str) -> AnalysisArtifactResponse:
    return AnalysisArtifactResponse.model_validate(supply_chain_artifact(symbol).model_dump())
