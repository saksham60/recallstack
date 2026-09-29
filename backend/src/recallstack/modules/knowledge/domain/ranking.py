import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal


def normalize_topic(value: str) -> str:
    topic = re.sub(r"\s+", "-", value.strip().lower())
    if not re.fullmatch(r"[a-z0-9][a-z0-9.+#-]{0,79}", topic):
        raise ValueError("Topics must be 1-80 characters using letters, digits, +, #, . or -")
    return topic


_PROMPT_FILLER = frozenset(
    "about and are can for from interested into learn learning like me more my news on "
    "please see show stories story that the them these this want with would".split()
)


def interest_terms(prompt: str) -> tuple[str, ...]:
    """Keep a small, safe set of positive search terms for feed ranking."""
    return tuple(
        dict.fromkeys(
            word
            for word in re.findall(r"[a-z0-9]{2,24}", prompt.lower())
            if word not in _PROMPT_FILLER
        )
    )[:12]


@dataclass(frozen=True, slots=True)
class RankingPolicy:
    importance: Decimal = Decimal("0.40")
    quality: Decimal = Decimal("0.20")
    source_quality: Decimal = Decimal("0.10")
    topic_preference: Decimal = Decimal("0.15")
    source_preference: Decimal = Decimal("0.05")
    freshness: Decimal = Decimal("0.10")
    interest_prompt: Decimal = Decimal("0.12")

    def score(
        self,
        *,
        importance: Decimal,
        quality: Decimal,
        source_quality: Decimal,
        topic_preference: Decimal,
        source_preference: Decimal,
        age_seconds: Decimal,
        interest_prompt: Decimal = Decimal(0),
    ) -> Decimal:
        return (
            self.importance * importance
            + self.quality * quality
            + self.source_quality * source_quality
            + self.topic_preference * topic_preference
            + self.source_preference * source_preference
            + self.freshness * (Decimal(1) - age_seconds / Decimal(604800))
            + self.interest_prompt * interest_prompt
        ).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)
