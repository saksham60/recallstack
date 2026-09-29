"""Opt-in LangSmith spans for model and discovery calls."""

import json
import logging
import os
import re
from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache
from typing import Any, Literal, cast

from langsmith import Client, trace
from langsmith.run_trees import RunTree

RunType = Literal["chain", "llm", "tool"]
logger = logging.getLogger(__name__)


def enabled() -> bool:
    return os.getenv("LANGSMITH_TRACING") == "true" and bool(os.getenv("LANGSMITH_API_KEY"))


@lru_cache(maxsize=1)
def _client() -> Client:
    return Client(api_key=os.environ["LANGSMITH_API_KEY"])


def _redact(text: str) -> str:
    for key in ("LANGSMITH_API_KEY", "NEBIUS_API_KEY", "TAVILY_API_KEY"):
        secret = os.getenv(key)
        if secret:
            text = text.replace(secret, "[redacted]")
    text = re.sub(
        r"\b(?:Bearer\s+\S+|(?:tvly-|sk-|ghp_|github_pat_)[A-Za-z0-9_-]+)\b", "[redacted]", text
    )
    return re.sub(
        r"\b(api[_ -]?key|password|secret|access[_ -]?token)\s*[:=]\s*[^\s,;]+",
        r"\1=[redacted]",
        text,
        flags=re.IGNORECASE,
    )


def safe(value: Any, *, max_string: int | None = None) -> Any:
    """Keep prompt content but bound external tool results and strip known secrets."""
    if isinstance(value, str):
        cleaned = _redact(value)
        return cleaned[:max_string] if max_string is not None else cleaned
    if isinstance(value, dict):
        return {str(key): safe(item, max_string=max_string) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [safe(item, max_string=max_string) for item in value]
    return value


@contextmanager
def span(
    name: str,
    run_type: RunType,
    inputs: dict[str, Any],
    metadata: dict[str, Any] | None = None,
) -> Iterator[RunTree | None]:
    if not enabled():
        yield None
        return
    with trace(
        name,
        run_type=run_type,
        inputs=safe(inputs, max_string=4000 if run_type == "tool" else None),
        metadata=metadata,
        client=_client(),
    ) as run:
        yield run


def model_output(response: object) -> dict[str, Any]:
    """Provider-visible output only; never copy reasoning fields or raw bodies."""
    if not isinstance(response, dict):
        return {"status": "invalid_response"}
    choice = (response.get("choices") or [None])[0]
    if not isinstance(choice, dict):
        return {"status": "invalid_response"}
    message = choice.get("message")
    message = message if isinstance(message, dict) else {}
    return cast(
        dict[str, Any],
        safe(
            {
                "content": message.get("content"),
                "tool_calls": message.get("tool_calls"),
                "finish_reason": choice.get("finish_reason"),
                "usage": response.get("usage"),
            }
        ),
    )


def flush() -> None:
    if enabled():
        try:
            _client().flush(timeout=5)
        except Exception:
            logger.warning("langsmith_flush_failed")


def json_input(content: bytes) -> dict[str, Any]:
    try:
        payload = json.loads(content)
        return payload if isinstance(payload, dict) else {}
    except (UnicodeError, ValueError):
        return {}
