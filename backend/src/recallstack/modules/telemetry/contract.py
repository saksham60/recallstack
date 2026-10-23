import json
import re
from datetime import datetime
from ipaddress import ip_address
from pathlib import Path
from typing import Any, Literal, Self
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

REGISTRY = json.loads(Path(__file__).with_name("registry.json").read_text(encoding="utf-8"))


def validate_properties(name: str, values: dict[str, Any]) -> dict[str, Any]:
    definition = REGISTRY["events"].get(name)
    if definition is None:
        raise ValueError("Unknown event name")
    allowed = definition["properties"]
    for key, value in values.items():
        kind = allowed.get(key)
        if kind is None:
            raise ValueError("Prohibited property")
        if isinstance(kind, list):
            valid = isinstance(value, str) and value in kind
        elif kind == "count":
            valid = type(value) is int and 0 <= value <= 10000
        elif kind == "duration":
            valid = type(value) is int and 0 <= value <= 600000
        elif kind == "active":
            valid = type(value) is int and 0 <= value <= 30
        elif kind == "bool":
            valid = type(value) is bool
        elif kind == "host":
            valid = isinstance(value, str) and bool(
                re.fullmatch(r"[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?", value)
            )
            if valid:
                try:
                    ip_address(value)
                except ValueError:
                    pass
                else:
                    valid = False
        else:
            # Slugs/versions only. No arbitrary error text, paths, queries or content.
            valid = isinstance(value, str) and bool(re.fullmatch(r"[a-zA-Z0-9_.-]{1,80}", value))
        if not valid:
            raise ValueError("Invalid property value")
    return values


class Event(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_id: UUID
    schema_version: Literal[1]
    event_name: str = Field(max_length=80)
    session_id: UUID
    journey_id: UUID | None = None
    correlation_id: UUID | None = None
    occurred_at: AwareDatetime
    source: Literal["web", "mobile"]
    entity_id: UUID | None = None
    properties: dict[str, Any] = Field(default_factory=dict, max_length=12)

    @model_validator(mode="after")
    def registered(self) -> Self:
        validate_properties(self.event_name, self.properties)
        return self


class Batch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    events: list[Event] = Field(min_length=1, max_length=30)


class Receipt(BaseModel):
    accepted: int
    duplicates: int
    received_at: datetime


class Metric(BaseModel):
    value: float | None = None
    status: Literal["measured", "partial_history", "not_tracked", "unknown", "not_applicable"]
    definition: str
    source: str


class Coverage(BaseModel):
    generated_at: datetime
    since: datetime
    until: datetime
    telemetry_since: datetime | None
    schema_version: Literal[1] = 1
    history: str = (
        "Canonical history plus observed client events; missing navigation is not reconstructed."
    )


class Intelligence(BaseModel):
    coverage: Coverage
    metrics: dict[str, Metric]
    features: list[dict[str, Any]] = Field(default_factory=list)
    daily: list[dict[str, Any]] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class TimelineItem(BaseModel):
    id: str
    user_id: UUID
    at: datetime
    name: str
    feature: str
    source: str
    evidence: str
    session_id: UUID | None = None
    entity_id: str | None = None
    correlation_id: UUID | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class Timeline(BaseModel):
    coverage: Coverage
    items: list[TimelineItem]
    next_cursor: str | None = None


class UserIntelligenceItem(BaseModel):
    user_id: UUID
    name: str | None
    email: str | None
    created_at: datetime
    last_activity: datetime | None
    active_days: int | None
    last_feature: str | None
    last_platform: str | None
    official_solves: int | None
    ai_runs: int | None
    feed_actions: int | None
    design_actions: int | None
    sessions: int | None
    signup_source: str
    classification: str


class IntelligenceUsers(BaseModel):
    coverage: Coverage
    total: int
    items: list[UserIntelligenceItem]


class ClassificationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    classification: Literal["internal", "judge", "demo", "test"] | None
    reason: Literal["admin_verified", "managed_test_identity", "judge_invitation"]
