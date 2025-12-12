from __future__ import annotations

import logging
from contextvars import ContextVar

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)


def configure_logging() -> None:
    # Simple, leveled logging; formatter keeps messages concise.
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


class RequestIdAdapter(logging.LoggerAdapter):
    def process(self, msg, kwargs):
        rid = request_id_var.get()
        if rid:
            msg = f"[request_id={rid}] {msg}"
        return msg, kwargs


def get_logger(name: str) -> logging.LoggerAdapter:
    return RequestIdAdapter(logging.getLogger(name), {})


def set_request_id(request_id: str) -> None:
    request_id_var.set(request_id)


def get_request_id() -> str | None:
    return request_id_var.get()

