from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.health import router as health_router
from app.api.metrics import router as metrics_router
from app.api.problems import (
    http_exception_adapter,
    unhandled_exception_handler,
    validation_exception_adapter,
)
from app.api.v1.analysis import router as analysis_router
from app.api.v1.contracts import router as contracts_router
from app.api.v1.ping import router as ping_router
from app.core.config import get_settings
from app.core.logging import request_logging_middleware


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(title=settings.app_name)
    application.middleware("http")(request_logging_middleware)
    application.add_exception_handler(StarletteHTTPException, http_exception_adapter)
    application.add_exception_handler(RequestValidationError, validation_exception_adapter)
    application.add_exception_handler(Exception, unhandled_exception_handler)
    application.include_router(health_router)
    application.include_router(metrics_router)
    application.include_router(ping_router)
    application.include_router(contracts_router)
    application.include_router(analysis_router)
    return application


app = create_app()
