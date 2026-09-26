import base64
import hashlib
import hmac
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from uuid import UUID

from recallstack.modules.knowledge.application.errors import invalid
from recallstack.modules.knowledge.application.ports import FeedPosition
from recallstack.modules.knowledge.domain.entities import KnowledgeSource, Preferences
from recallstack.modules.knowledge.domain.ranking import RankingPolicy


def preference_fingerprint(
    preferences: Preferences,
    sources: tuple[KnowledgeSource, ...],
    policy: RankingPolicy,
) -> str:
    data = json.dumps(
        [asdict(preferences), [asdict(source) for source in sources], asdict(policy)],
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(data.encode()).hexdigest()


@dataclass(frozen=True, slots=True)
class FeedCursor:
    anchor: datetime
    position: FeedPosition


class CursorCodec:
    def __init__(self, secret: str) -> None:
        if len(secret) < 32:
            raise ValueError("KNOWLEDGE_CURSOR_SECRET must contain at least 32 characters")
        self._secret = secret.encode()

    def encode(
        self,
        cursor: FeedCursor,
        *,
        profile_id: UUID,
        topic: str | None,
        fingerprint: str,
    ) -> str:
        payload = json.dumps(
            {
                "v": 1,
                "u": str(profile_id),
                "t": topic,
                "f": fingerprint,
                "a": cursor.anchor.isoformat(),
                "s": str(cursor.position.score),
                "p": cursor.position.published_at.isoformat(),
                "i": str(cursor.position.story_id),
            },
            separators=(",", ":"),
        ).encode()
        signature = hmac.digest(self._secret, payload, "sha256")
        return base64.urlsafe_b64encode(signature + payload).decode().rstrip("=")

    def decode(
        self,
        value: str,
        *,
        profile_id: UUID,
        topic: str | None,
        fingerprint: str,
        now: datetime,
    ) -> FeedCursor:
        try:
            if not 1 <= len(value) <= 2048:
                raise ValueError
            raw = base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
            signature, payload = raw[:32], raw[32:]
            if not hmac.compare_digest(signature, hmac.digest(self._secret, payload, "sha256")):
                raise ValueError
            data = json.loads(payload)
            if data["v"] != 1 or data["u"] != str(profile_id) or data["t"] != topic:
                raise ValueError
            anchor, published = datetime.fromisoformat(data["a"]), datetime.fromisoformat(data["p"])
            score = Decimal(data["s"])
            if (
                anchor.tzinfo is None
                or published.tzinfo is None
                or not score.is_finite()
                or not now - timedelta(hours=1) <= anchor <= now
                or published > anchor
            ):
                raise ValueError
            position = FeedPosition(score, published, UUID(data["i"]))
        except (ValueError, TypeError, KeyError, ArithmeticError):
            raise invalid("Invalid or expired feed cursor; restart pagination") from None
        if data["f"] != fingerprint:
            raise invalid(
                "Preferences or source configuration changed; restart pagination", status=409
            )
        return FeedCursor(anchor, position)
