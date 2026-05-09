from http import HTTPStatus
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

PROBLEM_JSON = "application/problem+json"


def problem_response(
    *,
    request: Request,
    status_code: int,
    title: str,
    detail: str,
    type_: str = "about:blank",
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        media_type=PROBLEM_JSON,
        content={
            "type": type_,
            "title": title,
            "status": status_code,
            "detail": detail,
            "instance": request.url.path,
        },
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    title = HTTPStatus(exc.status_code).phrase
    detail = str(exc.detail) if exc.detail else title
    return problem_response(
        request=request,
        status_code=exc.status_code,
        title=title,
        detail=detail,
    )


async def http_exception_adapter(request: Request, exc: Exception) -> JSONResponse:
    if isinstance(exc, StarletteHTTPException):
        return await http_exception_handler(request, exc)
    return await unhandled_exception_handler(request, exc)


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return problem_response(
        request=request,
        status_code=422,
        title="Unprocessable Entity",
        detail="Request validation failed",
        type_="https://example.com/problems/request-validation",
    )


async def validation_exception_adapter(request: Request, exc: Exception) -> JSONResponse:
    if isinstance(exc, RequestValidationError):
        return await validation_exception_handler(request, exc)
    return await unhandled_exception_handler(request, exc)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return problem_response(
        request=request,
        status_code=500,
        title="Internal Server Error",
        detail="Internal Server Error",
    )


def validation_error_detail(exc: RequestValidationError) -> list[dict[str, Any]]:
    return [dict(error) for error in exc.errors()]
