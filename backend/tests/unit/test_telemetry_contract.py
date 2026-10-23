from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from recallstack.modules.telemetry.contract import Batch, Event


def payload(**changes):
    return {
        "event_id": str(uuid4()),
        "schema_version": 1,
        "event_name": "dsa.problem_opened",
        "session_id": str(uuid4()),
        "source": "web",
        "occurred_at": datetime.now(UTC).isoformat(),
        "properties": {},
        **changes,
    }


@pytest.mark.parametrize(
    "changes",
    [
        {"source": "backend"},
        {"user_id": str(uuid4())},
        {"received_at": datetime.now(UTC).isoformat()},
        {"event_name": "dsa.official_accepted"},
        {"schema_version": 2},
        {"properties": {"prompt": "private"}},
        {"properties": {"entry_point": {"code": "private"}}},
        {"occurred_at": "2026-10-22T12:00:00"},
    ],
)
def test_client_cannot_assert_privileged_or_private_facts(changes):
    with pytest.raises(ValidationError):
        Event.model_validate(payload(**changes))


@pytest.mark.parametrize(
    "properties",
    [
        {"duration_ms": float("nan")},
        {"duration_ms": -1},
        {"duration_ms": 600001},
        {"duration_ms": True},
        {"outcome": "official_accepted"},
        {"passed": 10001},
    ],
)
def test_run_properties_have_finite_typed_bounds(properties):
    with pytest.raises(ValidationError):
        Event.model_validate(payload(event_name="dsa.local_run_completed", properties=properties))


def test_batches_are_bounded_and_v1_navigation_is_compatible():
    event = payload(
        event_name="navigation.screen_opened", properties={"screen": "problem", "feature": "dsa"}
    )
    assert Batch.model_validate({"events": [event]}).events[0].source == "web"
    with pytest.raises(ValidationError):
        Batch.model_validate({"events": [event] * 31})


def test_referrers_cannot_store_raw_ip_addresses():
    with pytest.raises(ValidationError):
        Event.model_validate(
            payload(
                event_name="acquisition.first_touch", properties={"referrer_host": "192.168.1.1"}
            )
        )
