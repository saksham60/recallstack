import re
from datetime import timedelta
from difflib import SequenceMatcher
from urllib.parse import urlsplit

from recallstack.modules.knowledge.domain.entities import StoryIdentity


def title_key(title: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", title.lower()))


def similar(left: StoryIdentity, right: StoryIdentity) -> bool:
    if left.canonical_hash == right.canonical_hash:
        return True
    if abs(left.published_at - right.published_at) > timedelta(days=1):
        return False
    a, b = title_key(left.title), title_key(right.title)
    if len(a) < 40 or len(b) < 40:
        return False
    if a == b:
        return True
    return (
        urlsplit(left.canonical_url).hostname == urlsplit(right.canonical_url).hostname
        and SequenceMatcher(None, a, b, autojunk=False).ratio() >= 0.96
    )
