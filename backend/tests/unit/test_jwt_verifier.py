from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt import algorithms

from recallstack.shared.auth.jwt_verifier import SupabaseJwtVerifier
from recallstack.shared.errors import AuthenticationError

ISSUER = "https://example.supabase.co/auth/v1"
AUDIENCE = "authenticated"
KID = "test-key"


def _key_material() -> tuple[rsa.RSAPrivateKey, dict[str, str]]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = algorithms.RSAAlgorithm.to_jwk(private_key.public_key(), as_dict=True)
    jwk.update({"kid": KID, "use": "sig", "alg": "RS256"})
    return private_key, jwk


def _token(
    private_key: rsa.RSAPrivateKey,
    subject: str,
    audience: str = AUDIENCE,
    *,
    issuer: str = ISSUER,
    expires_in: timedelta = timedelta(minutes=5),
) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": subject,
            "iss": issuer,
            "aud": audience,
            "iat": now,
            "exp": now + expires_in,
        },
        private_key,
        algorithm="RS256",
        headers={"kid": KID},
    )


async def test_verifies_valid_supabase_access_token_and_caches_jwks() -> None:
    private_key, jwk = _key_material()
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"keys": [jwk]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        verifier = SupabaseJwtVerifier(
            issuer=ISSUER,
            audience=AUDIENCE,
            jwks_url=f"{ISSUER}/.well-known/jwks.json",
            cache_seconds=600,
            client=client,
        )
        subject = uuid4()
        first = await verifier.verify(_token(private_key, str(subject)))
        second = await verifier.verify(_token(private_key, str(subject)))

    assert first == subject == second
    assert calls == 1


async def test_rejects_token_with_wrong_audience() -> None:
    private_key, jwk = _key_material()
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"keys": [jwk]}))
    async with httpx.AsyncClient(transport=transport) as client:
        verifier = SupabaseJwtVerifier(
            issuer=ISSUER,
            audience=AUDIENCE,
            jwks_url=f"{ISSUER}/.well-known/jwks.json",
            cache_seconds=600,
            client=client,
        )
        with pytest.raises(AuthenticationError):
            await verifier.verify(_token(private_key, str(uuid4()), "wrong-audience"))


@pytest.mark.parametrize(
    ("issuer", "expires_in"),
    [
        ("https://wrong.example/auth/v1", timedelta(minutes=5)),
        (ISSUER, timedelta(seconds=-1)),
    ],
)
async def test_rejects_wrong_issuer_and_expired_token(issuer: str, expires_in: timedelta) -> None:
    private_key, jwk = _key_material()
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"keys": [jwk]}))
    async with httpx.AsyncClient(transport=transport) as client:
        verifier = SupabaseJwtVerifier(
            issuer=ISSUER,
            audience=AUDIENCE,
            jwks_url=f"{ISSUER}/.well-known/jwks.json",
            cache_seconds=600,
            client=client,
        )
        with pytest.raises(AuthenticationError):
            await verifier.verify(
                _token(
                    private_key,
                    str(uuid4()),
                    issuer=issuer,
                    expires_in=expires_in,
                )
            )


async def test_rejects_invalid_signature() -> None:
    _, jwk = _key_material()
    untrusted_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"keys": [jwk]}))
    async with httpx.AsyncClient(transport=transport) as client:
        verifier = SupabaseJwtVerifier(
            issuer=ISSUER,
            audience=AUDIENCE,
            jwks_url=f"{ISSUER}/.well-known/jwks.json",
            cache_seconds=600,
            client=client,
        )
        with pytest.raises(AuthenticationError):
            await verifier.verify(_token(untrusted_key, str(uuid4())))


async def test_rejects_unsupported_signing_algorithm_before_jwks_lookup() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(500)

    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": str(uuid4()),
            "iss": ISSUER,
            "aud": AUDIENCE,
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        "not-a-trusted-asymmetric-key-32bytes",
        algorithm="HS256",
        headers={"kid": KID},
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        verifier = SupabaseJwtVerifier(
            issuer=ISSUER,
            audience=AUDIENCE,
            jwks_url=f"{ISSUER}/.well-known/jwks.json",
            cache_seconds=600,
            client=client,
        )
        with pytest.raises(AuthenticationError, match="unsupported signing algorithm"):
            await verifier.verify(token)
    assert calls == 0
