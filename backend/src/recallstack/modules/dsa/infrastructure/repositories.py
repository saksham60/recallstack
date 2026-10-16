from collections.abc import Mapping
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, case, func, literal, select, tuple_
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.catalog.infrastructure.sqlalchemy_models import (
    CategoryModel as Category,
)
from recallstack.modules.catalog.infrastructure.sqlalchemy_models import (
    DomainModel as Domain,
)
from recallstack.modules.catalog.infrastructure.sqlalchemy_models import (
    TopicModel as Topic,
)
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentItemModel as Item,
)
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentType,
    PublicationStatus,
)
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentVersionCategoryModel as VersionCategory,
)
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentVersionModel as ContentVersion,
)
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentVersionTopicModel as VersionTopic,
)
from recallstack.modules.dsa.infrastructure.sqlalchemy_models import (
    DefinitionModel as Definition,
)
from recallstack.modules.dsa.infrastructure.sqlalchemy_models import (
    RuntimeModel as Runtime,
)
from recallstack.modules.dsa.infrastructure.sqlalchemy_models import (
    SuiteModel as Suite,
)
from recallstack.modules.dsa.infrastructure.sqlalchemy_models import (
    TestCaseModel as TestCase,
)
from recallstack.modules.dsa.infrastructure.sqlalchemy_models import (
    VersionModel as Version,
)
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.modules.learning.infrastructure.sqlalchemy_models import (
    UserProgressModel as Progress,
)
from recallstack.modules.practice.infrastructure.sqlalchemy_models import (
    PracticeAttemptModel as Attempt,
)
from recallstack.modules.practice.infrastructure.sqlalchemy_models import (
    PracticeOutcome,
)

# Only these public contract fields are projected out of JSONB. In particular,
# implementation, reference_compiled and execution metadata are never retrieved.
CONTRACT_FIELDS = (
    "function",
    "input",
    "output",
    "encoding",
    "representation",
    "serialization",
    "indexing",
    "indices",
    "ordering",
    "tie_break",
    "absolute_tolerance",
    "modulus",
    "directed",
    "edge_direction",
    "case_sensitive",
    "strictly_increasing",
    "nonunique",
    "multiple_solutions",
    "negative_values",
    "division_permitted",
    "whole_string_excluded",
    "empty_text",
    "blank",
    "blocked",
    "stops",
    "scope",
    "operation",
    "operations",
    "job_fields",
    "result_keys",
)


def domain_predicate() -> Any:
    return and_(
        Item.domain_id.in_(select(Domain.id).where(Domain.slug == "dsa", Domain.is_active)),
        Item.type == ContentType.PROBLEM,
    )


def base_visible() -> Any:
    return and_(
        domain_predicate(),
        Item.archived_at.is_(None),
        Item.current_published_version_id.in_(
            select(ContentVersion.id)
            .where(
                ContentVersion.content_item_id == Item.id,
                ContentVersion.status == PublicationStatus.PUBLISHED,
                ContentVersion.published_at.is_not(None),
            )
            .correlate(Item)
        ),
    )


def approved() -> Any:
    # The imported review gate is the authoritative existing metadata location.
    # Missing/string values fail closed: only the JSON boolean true qualifies.
    return and_(
        Version.status == "published",
        Version.provenance["quality_review_20261015"]["publish_approved"]
        == literal(True, type_=JSONB),
    )


class DsaReadRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def catalog_statement(preview: bool = False, version_id: UUID | None = None) -> Any:
        versions = (
            select(Version.id)
            .join(Definition, Definition.id == Version.definition_id)
            .where(Definition.content_item_id == Item.id)
            .correlate(Item)
        )
        if preview:
            if version_id is not None:
                versions = versions.where(Version.id == version_id)
        else:
            versions = versions.where(Definition.current_version_id == Version.id, approved())
            if version_id is not None:
                versions = versions.where(Version.id == version_id)
        draft_first = [case((Version.status != "published", 0), else_=1)] if preview else []
        selected = (
            versions.order_by(
                *draft_first,
                Version.version_number.desc(),
                Version.created_at.desc(),
                Version.id.desc(),
            )
            .limit(1)
            .scalar_subquery()
        )
        title = func.coalesce(Version.specification["title"].as_string(), ContentVersion.title)
        return (
            select(
                Item.id,
                Item.slug,
                Item.difficulty,
                Item.domain_id,
                ContentVersion.id.label("content_version_id"),
                Version.id.label("problem_version_id"),
                title.label("title"),
                func.lower(func.btrim(title)).label("sort_title"),
                and_(
                    approved(),
                    base_visible(),
                    select(Definition.id)
                    .where(
                        Definition.content_item_id == Item.id,
                        Definition.id == Version.definition_id,
                        Definition.current_version_id == Version.id,
                    )
                    .correlate(Item, Version)
                    .exists(),
                ).label("approved"),
            )
            .join(
                ContentVersion,
                and_(
                    ContentVersion.id == Item.current_published_version_id,
                    ContentVersion.content_item_id == Item.id,
                ),
            )
            .join(Version, Version.id == selected)
            .where(domain_predicate(), Item.archived_at.is_(None))
            .where(*([] if preview else [base_visible()]))
        )

    @staticmethod
    def filtered(statement: Any, filters: Mapping[str, Any]) -> Any:
        if filters.get("search"):
            # contains(autoescape) treats % and _ as literal search characters.
            statement = statement.where(
                func.lower(
                    func.coalesce(Version.specification["title"].as_string(), ContentVersion.title)
                ).contains(filters["search"].lower(), autoescape=True)
            )
        if filters.get("difficulty"):
            statement = statement.where(Item.difficulty == filters["difficulty"])
        if filters.get("category"):
            statement = statement.where(
                select(VersionCategory.content_version_id)
                .join(
                    Category,
                    and_(
                        Category.id == VersionCategory.category_id,
                        Category.domain_id == VersionCategory.domain_id,
                    ),
                )
                .where(
                    VersionCategory.content_version_id == ContentVersion.id,
                    VersionCategory.content_item_id == Item.id,
                    VersionCategory.domain_id == Item.domain_id,
                    Category.id == filters["category"],
                    Category.is_active,
                )
                .exists()
            )
        if filters.get("topic"):
            statement = statement.where(
                select(VersionTopic.content_version_id)
                .join(
                    Topic,
                    and_(
                        Topic.id == VersionTopic.topic_id, Topic.domain_id == VersionTopic.domain_id
                    ),
                )
                .where(
                    VersionTopic.content_version_id == ContentVersion.id,
                    VersionTopic.content_item_id == Item.id,
                    VersionTopic.domain_id == Item.domain_id,
                    Topic.id == filters["topic"],
                )
                .exists()
            )
        return statement

    async def catalog(
        self, filters: dict[str, Any], key: tuple[str, UUID] | None, limit: int, preview: bool
    ) -> list[dict[str, Any]]:
        statement = self.filtered(self.catalog_statement(preview), filters).subquery()
        query = select(statement)
        if key:
            query = query.where(tuple_(statement.c.sort_title, statement.c.id) > key)
        rows = [
            dict(r)
            for r in (
                await self.session.execute(
                    query.order_by(statement.c.sort_title, statement.c.id).limit(limit + 1)
                )
            ).mappings()
        ]
        await self.taxonomy(rows)
        return rows

    async def detail(
        self, problem_id: UUID, preview: bool, version_id: UUID | None
    ) -> dict[str, Any] | None:
        contract = func.jsonb_strip_nulls(
            func.jsonb_build_object(
                *[
                    part
                    for name in CONTRACT_FIELDS
                    for part in (name, Version.specification["function_contract"][name])
                ]
            )
        )
        statement = self.catalog_statement(preview, version_id).where(Item.id == problem_id)
        statement = statement.add_columns(
            Version.specification["problem_statement"].as_string().label("description"),
            contract.label("function_contract"),
            Version.specification["constraints"].label("constraints"),
            Version.specification["examples"].label("examples"),
            Version.specification["supported_languages"].label("supported_languages"),
        )
        row = (await self.session.execute(statement)).mappings().first()
        if row is None:
            return None
        result = dict(row)
        await self.taxonomy([result])
        return result

    async def resolve(
        self, identifier: str, preview: bool, version_id: UUID | None
    ) -> dict[str, Any] | None:
        try:
            condition = Item.id == UUID(identifier)
        except ValueError:
            condition = Item.slug == identifier
        row = (
            (
                await self.session.execute(
                    self.catalog_statement(preview, version_id).where(condition)
                )
            )
            .mappings()
            .first()
        )
        if row is None:
            return None
        result = dict(row)
        await self.taxonomy([result])
        return result

    async def topic_progress(self, profile_id: UUID) -> list[dict[str, Any]]:
        visible = self.catalog_statement().subquery()
        query = (
            select(
                VersionCategory.category_id.label("id"),
                func.count(func.distinct(visible.c.id))
                .filter(
                    Progress.status.in_(
                        [
                            LearningStatus.ATTEMPTED,
                            LearningStatus.CONFIDENT,
                            LearningStatus.MASTERED,
                        ]
                    )
                )
                .label("attempted_count"),
                func.count(func.distinct(visible.c.id))
                .filter(Progress.status == LearningStatus.MASTERED)
                .label("mastered_count"),
            )
            .join(
                visible,
                and_(
                    visible.c.content_version_id == VersionCategory.content_version_id,
                    visible.c.id == VersionCategory.content_item_id,
                    visible.c.domain_id == VersionCategory.domain_id,
                ),
            )
            .outerjoin(
                Progress,
                and_(Progress.content_item_id == visible.c.id, Progress.user_id == profile_id),
            )
            .group_by(VersionCategory.category_id)
        )
        return [dict(row) for row in (await self.session.execute(query)).mappings()]

    async def taxonomy(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        versions = [r["content_version_id"] for r in rows]
        categories: dict[UUID, list[dict[str, Any]]] = {}
        topics: dict[UUID, list[dict[str, Any]]] = {}
        for model, link, target in (
            (Category, VersionCategory, categories),
            (Topic, VersionTopic, topics),
        ):
            query = (
                select(link.content_version_id, model.id, model.slug, model.name)
                .join(
                    model,
                    and_(
                        model.id
                        == getattr(link, "category_id" if model is Category else "topic_id"),
                        model.domain_id == link.domain_id,
                    ),
                )
                .where(link.content_version_id.in_(versions))
            )
            if model is Category:
                query = query.where(Category.is_active)
            for version, identifier, slug, name in await self.session.execute(
                query.order_by(model.name, model.id)
            ):
                target.setdefault(version, []).append(
                    {"id": identifier, "slug": slug, "name": name}
                )
        for row in rows:
            row["categories"] = categories.get(row["content_version_id"], [])
            row["topics"] = topics.get(row["content_version_id"], [])

    async def metadata(self, kind: str, preview: bool) -> list[dict[str, Any]]:
        model, link, column = (
            (Category, VersionCategory, VersionCategory.category_id)
            if kind == "categories"
            else (Topic, VersionTopic, VersionTopic.topic_id)
        )
        visible = self.catalog_statement(preview).subquery()
        count_query = select(
            column.label("id"), func.count(func.distinct(visible.c.id)).label("count")
        )
        counts = (
            count_query.join(
                visible,
                and_(
                    visible.c.content_version_id == link.content_version_id,
                    visible.c.id == link.content_item_id,
                    visible.c.domain_id == link.domain_id,
                ),
            )
            .group_by(column)
            .subquery()
        )
        query = (
            select(
                model.id,
                model.slug,
                model.name,
                func.coalesce(counts.c.count, 0).label("problem_count"),
            )
            .outerjoin(counts, counts.c.id == model.id)
            .join(Domain, Domain.id == model.domain_id)
            .where(Domain.slug == "dsa", Domain.is_active)
        )
        if kind == "categories":
            query = query.where(Category.is_active)
        return [
            dict(r)
            for r in (await self.session.execute(query.order_by(model.name, model.id))).mappings()
        ]

    async def tests(
        self, version_id: UUID, key: tuple[int, UUID] | None, limit: int
    ) -> list[dict[str, Any]]:
        # Select the latest suite BEFORE checking status; never fall back to an older suite.
        suite = (
            select(Suite.id)
            .where(Suite.problem_version_id == version_id)
            .order_by(Suite.suite_version.desc(), Suite.id.desc())
            .limit(1)
            .scalar_subquery()
        )
        query = (
            select(
                TestCase.id,
                TestCase.ordinal,
                TestCase.input_json,
                TestCase.expected_json.label("expected_output_json"),
            )
            .join(Suite, Suite.id == TestCase.suite_id)
            .where(
                Suite.id == suite,
                Suite.status == "published",
                TestCase.visibility == "public",
                TestCase.validation_status == "verified",
                TestCase.input_json.is_not(None),
            )
        )
        if key:
            query = query.where(tuple_(TestCase.ordinal, TestCase.id) > key)
        return [
            dict(r)
            for r in (
                await self.session.execute(
                    query.order_by(TestCase.ordinal, TestCase.id).limit(limit + 1)
                )
            ).mappings()
        ]

    async def history(
        self,
        profile_id: UUID,
        start_at: datetime | None,
        end_at: datetime | None,
        key: tuple[datetime, UUID] | None,
        limit: int,
    ) -> list[dict[str, Any]]:
        query = (
            select(
                Attempt.id,
                Attempt.content_item_id,
                Attempt.attempted_at,
                Attempt.outcome,
                Attempt.duration_seconds,
                Attempt.hint_used,
                Attempt.confidence_before,
                Attempt.confidence_after,
            )
            .join(Item, Item.id == Attempt.content_item_id)
            .where(domain_predicate(), Attempt.user_id == profile_id)
        )
        if start_at:
            query = query.where(Attempt.attempted_at >= start_at)
        if end_at:
            query = query.where(Attempt.attempted_at < end_at)
        if key:
            query = query.where(tuple_(Attempt.attempted_at, Attempt.id) < key)
        return [
            dict(r)
            for r in (
                await self.session.execute(
                    query.order_by(Attempt.attempted_at.desc(), Attempt.id.desc()).limit(limit + 1)
                )
            ).mappings()
        ]

    async def statistics(self, profile_id: UUID) -> dict[str, Any]:
        catalog_count = select(func.count()).select_from(self.catalog_statement().subquery())
        attempts = (
            select(
                func.count().label("practice_attempt_count"),
                func.count(func.distinct(Attempt.content_item_id)).label("attempted_problem_count"),
                func.count()
                .filter(
                    Attempt.outcome.in_(
                        [PracticeOutcome.SOLVED_INDEPENDENTLY, PracticeOutcome.SOLVED_WITH_HINT]
                    )
                )
                .label("self_reported_solved_attempt_count"),
            )
            .join(Item, Item.id == Attempt.content_item_id)
            .where(domain_predicate(), Attempt.user_id == profile_id)
        )
        result = dict((await self.session.execute(attempts)).mappings().one())
        result["total_catalog_problems"] = int((await self.session.scalar(catalog_count)) or 0)
        statuses = {s.value: 0 for s in LearningStatus}
        query = (
            select(Progress.status, func.count())
            .join(Item, Item.id == Progress.content_item_id)
            .where(domain_predicate(), Progress.user_id == profile_id)
            .group_by(Progress.status)
        )
        for state, count in await self.session.execute(query):
            statuses[state.value] = count
        result["learning_status_counts"] = statuses
        result["mastered_problem_count"] = statuses["mastered"]
        return result

    async def languages(self) -> dict[str, list[str]]:
        # No language is inferred from private references or runtime configuration.
        configured = list(
            (
                await self.session.scalars(
                    select(Runtime.language)
                    .where(Runtime.enabled)
                    .distinct()
                    .order_by(Runtime.language)
                )
            ).all()
        )
        visible = self.catalog_statement().subquery()
        rows = await self.session.scalars(
            select(Version.specification["supported_languages"]).where(
                Version.id.in_(select(visible.c.problem_version_id))
            )
        )
        published = sorted(
            {
                language
                for row in rows
                if isinstance(row, list)
                for language in row
                if isinstance(language, str)
            }
        )
        return {
            "published_contract_languages": published,
            "configured_runtime_languages": configured,
            "execution_languages": [],
        }
