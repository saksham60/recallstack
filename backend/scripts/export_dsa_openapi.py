"""Export the registered DSA contract and its referenced schemas without opening a database."""

import json
from pathlib import Path

from recallstack.main import create_app
from recallstack.shared.config import Settings


def export() -> None:
    app = create_app(
        Settings(
            _env_file=None,
            database_url=None,
            supabase_project_url="https://example.supabase.co",
            app_env="test",
        )
    )
    schema = app.openapi()
    paths = {
        path: value for path, value in schema["paths"].items() if path.startswith("/api/v1/dsa/")
    }
    components = {}
    pending = [paths]
    while pending:
        node = pending.pop()
        if isinstance(node, dict):
            reference = node.get("$ref", "")
            if reference.startswith("#/components/schemas/"):
                name = reference.rsplit("/", 1)[1]
                if name not in components:
                    components[name] = schema["components"]["schemas"][name]
                    pending.append(components[name])
            pending.extend(node.values())
        elif isinstance(node, list):
            pending.extend(node)
    result = {
        "openapi": schema["openapi"],
        "info": {**schema["info"], "title": "ReasonAI DSA API"},
        "paths": paths,
        "components": {
            "schemas": components,
            "securitySchemes": schema["components"].get("securitySchemes", {}),
        },
    }
    destination = Path(__file__).resolve().parents[1] / "docs" / "dsa-openapi.json"
    destination.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Exported {len(paths)} DSA paths and {len(components)} schemas")


if __name__ == "__main__":
    export()
