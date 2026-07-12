from typing import cast

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from recallstack.shared.errors.exceptions import AppError


def _problem(
    request: Request, *, error_type: str, title: str, status: int, detail: str
) -> JSONResponse:
    request_id = cast(str, getattr(request.state, "request_id", "unknown"))
    response = JSONResponse(
        status_code=status,
        content={
            "type": f"https://recallstack.dev/problems/{error_type}",
            "title": title,
            "status": status,
            "detail": detail,
            "instance": request.url.path,
            "request_id": request_id,
        },
        media_type="application/problem+json",
    )
    if status == 401:
        response.headers["WWW-Authenticate"] = "Bearer"
    return response


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return _problem(
            request,
            error_type=exc.error_type,
            title=exc.title,
            status=exc.status,
            detail=exc.detail,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors = "; ".join(
            f"{'.'.join(str(part) for part in item['loc'])}: {item['msg']}" for item in exc.errors()
        )
        return _problem(
            request,
            error_type="validation-error",
            title="Request validation failed",
            status=422,
            detail=errors,
        )

    @app.exception_handler(HTTPException)
    async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
        title = "Request failed"
        if exc.status_code == 404:
            title = "Resource not found"
        elif exc.status_code == 413:
            title = "Request body too large"
        return _problem(
            request,
            error_type="http-error",
            title=title,
            status=exc.status_code,
            detail=str(exc.detail),
        )
