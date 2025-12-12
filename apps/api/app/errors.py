from __future__ import annotations

from typing import Any, Dict, Optional

from starlette.responses import JSONResponse

from app.logging import get_request_id, get_logger


class ApiError(RuntimeError):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int = 500,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


def api_error_response(exc: ApiError) -> JSONResponse:
    request_id = get_request_id()
    payload: Dict[str, Any] = {
        "error": {
            "code": exc.code,
            "message": exc.message,
            "request_id": request_id,
        }
    }
    if exc.details:
        payload["error"]["details"] = exc.details
    return JSONResponse(status_code=exc.status_code, content=payload)


def log_api_error(exc: ApiError) -> None:
    logger = get_logger("app.error")
    logger.warning(f"{exc.code}: {exc.message}")

