import ast
from pathlib import Path


def test_all_approved_tables_have_module_owned_persistence_models() -> None:
    from recallstack.modules.catalog.infrastructure import (
        sqlalchemy_models as catalog,  # noqa: F401
    )
    from recallstack.modules.content.infrastructure import (
        sqlalchemy_models as content,  # noqa: F401
    )
    from recallstack.modules.identity.infrastructure import (
        sqlalchemy_models as identity,  # noqa: F401
    )
    from recallstack.modules.learning.infrastructure import (
        sqlalchemy_models as learning,  # noqa: F401
    )
    from recallstack.modules.practice.infrastructure import (
        sqlalchemy_models as practice,  # noqa: F401
    )
    from recallstack.modules.recall.infrastructure import sqlalchemy_models as recall  # noqa: F401
    from recallstack.modules.sync.infrastructure import sqlalchemy_models as sync  # noqa: F401
    from recallstack.shared.database.base import Base

    assert len(Base.metadata.tables) == 34


def test_domain_and_application_packages_do_not_import_sqlalchemy() -> None:
    source_root = Path("src/recallstack/modules")
    violations: list[str] = []
    for package_name in ("domain", "application"):
        for path in source_root.glob(f"**/{package_name}/**/*.py"):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    modules = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom):
                    modules = [node.module or ""]
                else:
                    continue
                if any(
                    module == "sqlalchemy" or module.startswith("sqlalchemy.") for module in modules
                ):
                    violations.append(str(path))
    assert not violations
