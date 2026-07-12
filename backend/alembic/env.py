from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context
from recallstack.modules.catalog.infrastructure import (
    sqlalchemy_models as catalog_models,  # noqa: F401
)
from recallstack.modules.content.infrastructure import (
    sqlalchemy_models as content_models,  # noqa: F401
)
from recallstack.modules.identity.infrastructure import (
    sqlalchemy_models as identity_models,  # noqa: F401
)
from recallstack.modules.learning.infrastructure import (
    sqlalchemy_models as learning_models,  # noqa: F401
)
from recallstack.modules.practice.infrastructure import (
    sqlalchemy_models as practice_models,  # noqa: F401
)
from recallstack.modules.recall.infrastructure import (
    sqlalchemy_models as recall_models,  # noqa: F401
)
from recallstack.modules.sync.infrastructure import sqlalchemy_models as sync_models  # noqa: F401
from recallstack.shared.config import get_settings
from recallstack.shared.database.base import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
if settings.database_url is None:
    raise RuntimeError("DATABASE_URL is required to run migrations")
config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
