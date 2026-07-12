import asyncio
import time
from typing import Final, cast
from uuid import UUID

import httpx
import jwt
from jwt import PyJWK
from jwt.exceptions import InvalidTokenError, PyJWKError

from recallstack.shared.errors import AuthenticationError

_ALGORITHMS: Final = frozenset({"RS256", "ES256"})


class SupabaseJwtVerifier:
    """Verifies Supabase access tokens against a bounded in-memory JWKS cache."""

    def __init__(
        self,
        *,
        issuer: str,
        audience: str,
        jwks_url: str,
        cache_seconds: int,
        client: httpx.AsyncClient,
    ) -> None:
        self._issuer = issuer
        self._audience = audience
        self._jwks_url = jwks_url
        self._cache_seconds = cache_seconds
        self._client = client
        self._keys: dict[str, PyJWK] = {}
        self._expires_at = 0.0
        self._lock = asyncio.Lock()

    async def verify(self, token: str) -> UUID:
        try:
            header = jwt.get_unverified_header(token)
            kid = header.get("kid")
            algorithm = header.get("alg")
            if not isinstance(kid, str) or not kid:
                raise AuthenticationError("Token is missing a key identifier")
            if algorithm not in _ALGORITHMS:
                raise AuthenticationError("Token uses an unsupported signing algorithm")
            key = await self._get_key(kid)
            claims = jwt.decode(
                token,
                key=key.key,
                algorithms=[algorithm],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            )
            subject = UUID(cast(str, claims["sub"]))
        except AuthenticationError:
            raise
        except (InvalidTokenError, KeyError, TypeError, ValueError) as exc:
            raise AuthenticationError("Bearer token is invalid or expired") from exc
        return subject

    async def _get_key(self, kid: str) -> PyJWK:
        now = time.monotonic()
        if now < self._expires_at and kid in self._keys:
            return self._keys[kid]
        async with self._lock:
            now = time.monotonic()
            if now >= self._expires_at or kid not in self._keys:
                await self._refresh()
            key = self._keys.get(kid)
            if key is None:
                raise AuthenticationError("Token signing key is not recognized")
            return key

    async def _refresh(self) -> None:
        try:
            response = await self._client.get(self._jwks_url)
            response.raise_for_status()
            document = response.json()
            raw_keys = document.get("keys", [])
            keys = {
                key.key_id: key
                for raw in raw_keys
                if (key := PyJWK.from_dict(raw)).key_id is not None
            }
            if not keys:
                raise AuthenticationError("Authentication key service returned no usable keys")
        except AuthenticationError:
            raise
        except (httpx.HTTPError, ValueError, TypeError, PyJWKError) as exc:
            raise AuthenticationError("Authentication key service is unavailable") from exc
        self._keys = keys
        self._expires_at = time.monotonic() + self._cache_seconds
