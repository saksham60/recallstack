import base64
import hashlib
import hmac
from datetime import UTC, datetime
from urllib.parse import quote, urlsplit
from xml.etree.ElementTree import Element, SubElement, tostring

from defusedxml.ElementTree import fromstring

from recallstack.modules.knowledge.infrastructure.providers.http import ProviderError, ProviderHttp


def sign_request(
    method: str,
    url: str,
    body: bytes,
    *,
    access_key: str,
    secret_key: str,
    now: datetime,
    headers: dict[str, str] | None = None,
    region: str = "auto",
) -> dict[str, str]:
    """Narrow S3 SigV4 signer for fully buffered PUT and DeleteObjects payloads."""
    parsed = urlsplit(url)
    day, timestamp = now.strftime("%Y%m%d"), now.strftime("%Y%m%dT%H%M%SZ")
    digest = hashlib.sha256(body).hexdigest()
    signed = {
        **(headers or {}),
        "host": parsed.netloc,
        "x-amz-content-sha256": digest,
        "x-amz-date": timestamp,
    }
    names = ";".join(sorted(signed))
    canonical_headers = "".join(f"{key}:{signed[key].strip()}\n" for key in sorted(signed))
    query = "delete=" if parsed.query == "delete" else parsed.query
    canonical = "\n".join((method, parsed.path or "/", query, canonical_headers, names, digest))
    scope = f"{day}/{region}/s3/aws4_request"
    to_sign = (
        f"AWS4-HMAC-SHA256\n{timestamp}\n{scope}\n{hashlib.sha256(canonical.encode()).hexdigest()}"
    )
    signing_key = ("AWS4" + secret_key).encode()
    for part in (day, region, "s3", "aws4_request"):
        signing_key = hmac.digest(signing_key, part.encode(), "sha256")
    signature = hmac.new(signing_key, to_sign.encode(), hashlib.sha256).hexdigest()
    signed["Authorization"] = (
        f"AWS4-HMAC-SHA256 Credential={access_key}/{scope},"
        f"SignedHeaders={names},Signature={signature}"
    )
    return signed


class R2ImageStore:
    def __init__(
        self,
        http: ProviderHttp,
        *,
        endpoint: str,
        bucket: str,
        public_base: str,
        access_key: str,
        secret_key: str,
    ) -> None:
        self._http, self._endpoint = http, endpoint.rstrip("/")
        self._bucket, self._public = bucket, public_base.rstrip("/")
        self._access, self._secret = access_key, secret_key

    def public_url(self, key: str) -> str:
        return f"{self._public}/{quote(key, safe='/')}"

    async def put(self, key: str, content: bytes) -> None:
        url = f"{self._endpoint}/{quote(self._bucket, safe='')}/{quote(key, safe='/')}"
        headers = sign_request(
            "PUT",
            url,
            content,
            access_key=self._access,
            secret_key=self._secret,
            now=datetime.now(UTC),
            headers={
                "content-type": "image/webp",
                "cache-control": "public, max-age=604800, immutable",
            },
        )
        await self._http.request("PUT", url, content=content, headers=headers)

    async def delete(self, keys: tuple[str, ...]) -> frozenset[str]:
        if not keys:
            return frozenset()
        if len(keys) > 1000:
            raise ValueError("R2 deletion batch exceeds 1000 keys")
        root = Element("Delete", xmlns="http://s3.amazonaws.com/doc/2006-03-01/")
        for key in keys:
            SubElement(SubElement(root, "Object"), "Key").text = key
        body = tostring(root, encoding="utf-8")
        url = f"{self._endpoint}/{quote(self._bucket, safe='')}?delete"
        headers = sign_request(
            "POST",
            url,
            body,
            access_key=self._access,
            secret_key=self._secret,
            now=datetime.now(UTC),
            headers={
                "content-type": "application/xml",
                # S3 DeleteObjects requires a transport checksum, not a password/security digest.
                "content-md5": base64.b64encode(
                    hashlib.md5(body, usedforsecurity=False).digest()
                ).decode(),
            },
        )
        response = await self._http.request("POST", url, content=body, headers=headers)
        try:
            result = fromstring(response)
        except Exception:
            raise ProviderError("r2_invalid_delete_response") from None
        if result.tag.rsplit("}", 1)[-1] != "DeleteResult":
            raise ProviderError("r2_delete_failed")
        deleted: set[str] = set()
        for node in result:
            if node.tag.rsplit("}", 1)[-1] == "Deleted":
                for child in node:
                    if child.tag.rsplit("}", 1)[-1] == "Key" and child.text in keys:
                        deleted.add(child.text)
        return frozenset(deleted)
