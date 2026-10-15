"""Versioned, filter-bound keyset cursors. Cursors confer no authorization."""

import base64
import binascii
import hashlib
import json
from typing import Any

from recallstack.shared.errors import AppError


def invalid_request(detail: str) -> AppError:
    return AppError(
        error_type="validation-error", title="Request validation failed", status=422, detail=detail
    )


def encode_cursor(scope: dict[str, Any], key: list[str]) -> str:
    fingerprint = hashlib.sha256(json.dumps(scope, sort_keys=True).encode()).hexdigest()
    payload = json.dumps({"v": 1, "scope": fingerprint, "key": key}, separators=(",", ":"))
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def decode_cursor(token: str | None, scope: dict[str, Any]) -> list[str] | None:
    if token is None:
        return None
    try:
        if not token or len(token) > 2048:
            raise ValueError
        payload = json.loads(
            base64.b64decode(token + "=" * (-len(token) % 4), altchars=b"-_", validate=True)
        )
        fingerprint = hashlib.sha256(json.dumps(scope, sort_keys=True).encode()).hexdigest()
        if (
            not isinstance(payload, dict)
            or payload.get("v") != 1
            or payload.get("scope") != fingerprint
        ):
            raise ValueError
        key = payload.get("key")
        if not isinstance(key, list) or len(key) != 2 or not all(isinstance(k, str) for k in key):
            raise ValueError
        return key
    except (ValueError, TypeError, binascii.Error, UnicodeError, RecursionError):
        raise invalid_request(
            "Invalid cursor or cursor does not match the selected filters"
        ) from None
