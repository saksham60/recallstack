from dataclasses import replace
from uuid import UUID

from recallstack.modules.knowledge.application.errors import invalid
from recallstack.modules.knowledge.application.ports import UnitOfWorkFactory
from recallstack.modules.knowledge.domain.entities import PreferencePatch, Preferences
from recallstack.modules.knowledge.domain.ranking import normalize_topic


class PreferenceService:
    def __init__(self, uow: UnitOfWorkFactory) -> None:
        self._uow = uow

    async def get(self, profile_id: UUID) -> Preferences:
        async with self._uow() as uow:
            return await uow.repository.preferences(profile_id)

    async def patch(self, profile_id: UUID, patch: PreferencePatch) -> Preferences:
        if patch.topics is not None:
            try:
                topics = [normalize_topic(item.topic) for item in patch.topics]
            except ValueError as exc:
                raise invalid(str(exc)) from None
            if len(topics) > 50 or len(set(topics)) != len(topics):
                raise invalid("Topic preferences must be unique and limited to 50")
            patch = replace(
                patch,
                topics=tuple(
                    replace(item, topic=topic)
                    for item, topic in zip(patch.topics, topics, strict=True)
                ),
            )
        if patch.minimum_importance is not None and (
            not patch.minimum_importance.is_finite() or not 0 <= patch.minimum_importance <= 1
        ):
            raise invalid("minimumImportance must be between 0 and 1")
        if any(
            not weight.is_finite() or not 0 <= weight <= 2
            for weight in (
                tuple(item.weight for item in patch.topics or ())
                + tuple(item.weight for item in patch.sources or ())
            )
        ):
            raise invalid("Preference weights must be between 0 and 2")
        if patch.sources is not None:
            keys = [item.key for item in patch.sources]
            if len(keys) > 50 or len(set(keys)) != len(keys):
                raise invalid("Source preferences must be unique and limited to 50")
        async with self._uow() as uow:
            if patch.sources is not None:
                known = {source.key for source in await uow.repository.sources()}
                if any(source.key not in known for source in patch.sources):
                    raise invalid("Unknown Knowledge source key")
            result = await uow.repository.patch_preferences(profile_id, patch)
            await uow.commit()
            return result
