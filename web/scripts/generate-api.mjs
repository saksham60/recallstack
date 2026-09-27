import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import openapiTS, { astToString, COMMENT_HEADER } from "openapi-typescript";

// Export the checked-out API without starting its lifespan or touching the database.
// backend/openapi.json can lag behind a merged backend change.
const schema = execFileSync("uv", ["run", "python", "-c", `
import json
from pydantic import SecretStr
from recallstack.main import create_app
from recallstack.shared.config import get_settings
settings = get_settings().model_copy(update={"knowledge_enabled": True, "knowledge_cursor_secret": SecretStr("schema-export-only-not-a-runtime-key")})
print(json.dumps(create_app(settings).openapi()))
`], { cwd: new URL("../../backend/", import.meta.url), encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
const types = await openapiTS(JSON.parse(schema));
writeFileSync(new URL("../src/lib/api/types.ts", import.meta.url), COMMENT_HEADER + astToString(types));
console.log("Generated API types from the checked-out backend.");
