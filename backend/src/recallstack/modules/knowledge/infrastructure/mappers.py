from recallstack.modules.knowledge.domain.entities import KnowledgeSource, KnowledgeStory
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    KnowledgeSourceModel,
    KnowledgeStoryModel,
)


def source_to_domain(source: KnowledgeSourceModel) -> KnowledgeSource:
    return KnowledgeSource(
        source.id,
        source.key,
        source.name,
        source.source_type,
        source.enabled,
        source.quality_weight,
    )


def story_to_domain(
    story: KnowledgeStoryModel,
    source: KnowledgeSourceModel,
    topics: tuple[str, ...],
) -> KnowledgeStory:
    return KnowledgeStory(
        id=story.id,
        source=source_to_domain(source),
        canonical_url=story.canonical_url,
        canonical_hash=story.canonical_hash,
        title=story.title,
        summary=story.summary,
        why_it_matters=story.why_it_matters,
        image_url=story.image_url,
        image_key=story.image_key,
        published_at=story.published_at,
        discovered_at=story.discovered_at,
        importance_score=story.importance_score,
        quality_score=story.quality_score,
        topics=topics,
        bullets=tuple(story.bullets),
        external_id=story.external_id,
        status=story.status,
    )
