from dataclasses import replace
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest

from recallstack.modules.knowledge.application.cursor import CursorCodec, FeedCursor
from recallstack.modules.knowledge.application.ports import FeedPosition
from recallstack.modules.knowledge.domain.entities import StoryIdentity
from recallstack.modules.knowledge.domain.ranking import RankingPolicy, normalize_topic
from recallstack.modules.knowledge.infrastructure.canonicalization import canonicalize, public_url
from recallstack.modules.knowledge.infrastructure.dedupe import similar
from recallstack.shared.errors import AppError


def test_canonicalization_preserves_content_identity():
    assert canonicalize("https://example.com/a?x=%20&sig=a%2fb&utm_source=x") == (
        "https://example.com/a?x=%20&sig=a%2fb"
    )
    assert canonicalize("https://Example.COM?utm_source=x&id=4#top") == "https://example.com/?id=4"
    assert canonicalize("https://example.com/Case/?page=2&ref=docs") == (
        "https://example.com/Case/?page=2&ref=docs"
    )
    assert canonicalize("https://example.com/Case") != canonicalize("https://example.com/case")


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost/x",
        "http://127.0.0.1",
        "http://10.0.0.1",
        "http://169.254.169.254",
        "http://[::1]",
        "http://[::ffff:127.0.0.1]",
        "file:///tmp/data",
        "ftp://example.com",
        "https://user:password@example.com",
        "http://metadata.google.internal",
        "http://192.168.1.1",
        "http://172.16.0.1",
        "https://example.com:444/",
    ],
)
def test_unsafe_url_rejected(url):
    with pytest.raises(ValueError):
        public_url(url)


def test_conservative_title_dedupe():
    now = datetime.now(UTC)
    a = StoryIdentity(
        "a",
        "A new engineering approach to database query optimization",
        "https://example.com/1",
        now,
    )
    b = replace(a, canonical_hash="b", canonical_url="https://example.com/2")
    assert similar(a, b)
    assert not similar(a, replace(b, published_at=now - timedelta(days=3)))
    assert not similar(a, replace(b, title="A new method for graphics compiler performance"))


def test_preferred_topic_improves_deterministic_score():
    inputs = dict(
        importance=Decimal("0.8"),
        quality=Decimal("0.9"),
        source_quality=Decimal("1"),
        source_preference=Decimal("0"),
        age_seconds=Decimal("3600"),
    )
    policy = RankingPolicy()
    ordinary = policy.score(**inputs, topic_preference=Decimal(0))
    preferred = policy.score(**inputs, topic_preference=Decimal(1))
    assert preferred - ordinary == Decimal("0.15")
    assert normalize_topic(" AI Agents ") == "ai-agents"


def test_cursor_signed_scoped_stable_and_expiring():
    codec, user, now = CursorCodec("x" * 32), uuid4(), datetime.now(UTC)
    cursor = FeedCursor(now, FeedPosition(Decimal("0.8"), now, uuid4()))
    value = codec.encode(cursor, profile_id=user, topic="ai", fingerprint="a")
    assert codec.decode(value, profile_id=user, topic="ai", fingerprint="a", now=now) == cursor
    for token, uid, topic, fingerprint, clock in [
        (value[:-2] + "xx", user, "ai", "a", now),
        (value, uuid4(), "ai", "a", now),
        (value, user, "rust", "a", now),
        (value, user, "ai", "b", now),
        (value, user, "ai", "a", now + timedelta(hours=2)),
        ("!invalid", user, "ai", "a", now),
        ("x" * 2049, user, "ai", "a", now),
    ]:
        with pytest.raises(AppError):
            codec.decode(token, profile_id=uid, topic=topic, fingerprint=fingerprint, now=clock)
