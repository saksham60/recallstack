import hashlib
import ipaddress
from urllib.parse import unquote_plus, urlsplit, urlunsplit

TRACKING = frozenset({"fbclid", "gclid", "msclkid", "mc_cid", "mc_eid"})


def public_url(value: str) -> str:
    if len(value) > 4096 or any(ord(char) < 32 for char in value) or "\\" in value:
        raise ValueError("Unsafe URL")
    parsed = urlsplit(value)
    host = parsed.hostname
    if (
        parsed.scheme not in {"http", "https"}
        or not host
        or parsed.username
        or parsed.password
        or parsed.port not in {None, 80, 443}
        or "%" in host
        or host.lower().rstrip(".") in {"localhost", "metadata.google.internal"}
        or host.lower().rstrip(".").endswith((".localhost", ".local", ".internal"))
    ):
        raise ValueError("Unsafe URL")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        if "." not in host or not host.encode("idna"):
            raise ValueError("Unsafe host") from None
    else:
        if not address.is_global or address.is_multicast or address.is_unspecified:
            raise ValueError("Nonpublic IP address")
    return value


def canonicalize(value: str) -> str:
    parsed = urlsplit(public_url(value.strip()))
    host = (parsed.hostname or "").lower().encode("idna").decode()
    if ":" in host:
        host = f"[{host}]"
    port = parsed.port
    if port and (parsed.scheme, port) not in {("https", 443), ("http", 80)}:
        host += f":{port}"
    # Preserve path case and non-root trailing slashes: these can identify different resources.
    path = parsed.path or "/"
    query = "&".join(
        part
        for part in parsed.query.split("&")
        if not (key := unquote_plus(part.split("=", 1)[0]).lower()).startswith("utm_")
        and key not in TRACKING
    )
    return urlunsplit((parsed.scheme.lower(), host, path, query, ""))


def canonical_hash(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()
