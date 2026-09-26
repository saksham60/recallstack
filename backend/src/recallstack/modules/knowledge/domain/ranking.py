import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal


def normalize_topic(value: str) -> str:
    topic = re.sub(r"\s+", "-", value.strip().lower())
    if not re.fullmatch(r"[a-z0-9][a-z0-9.+#-]{0,79}", topic):
        raise ValueError("Topics must be 1-80 characters using letters, digits, +, #, . or -")
    return topic


@dataclass(frozen=True, slots=True)
class RankingPolicy:
    importance: Decimal = Decimal("0.40")
    quality: Decimal = Decimal("0.20")
    source_quality: Decimal = Decimal("0.10")
    topic_preference: Decimal = Decimal("0.15")
    source_preference: Decimal = Decimal("0.05")
    freshness: Decimal = Decimal("0.10")

    def score(
        self,
        *,
        importance: Decimal,
        quality: Decimal,
        source_quality: Decimal,
        topic_preference: Decimal,
        source_preference: Decimal,
        age_seconds: Decimal,
    ) -> Decimal:
        return (
            self.importance * importance
            + self.quality * quality
            + self.source_quality * source_quality
            + self.topic_preference * topic_preference
            + self.source_preference * source_preference
            + self.freshness * (Decimal(1) - age_seconds / Decimal(604800))
        ).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)
