# Scoped automated verification — 2026-10-11

**Repository SHA:** `9641835b13d10bdad508c895718481146cbf57de`. Runner: Windows, PowerShell, Node 20.16.0 for Playwright and Node 22.23.2 for typecheck, Python 3.12.4. These automated tests use fixtures and mocked provider responses where applicable; they are **not live Nemotron, Tavily, or production collaboration executions**. Complete local logs were retained in the runner's temporary directory and are not committed because raw diagnostic output was not approved for public release.

| UTC interval | Command (working directory) | Exit | Actual result | Local full log |
| --- | --- | ---: | --- | --- |
| 08:30:27–08:31:07 | `npx playwright test --config=playwright.system-design-state.config.ts langsmith.spec.ts dsa-reasonai-agent.spec.ts system-design-reasonai-agent.spec.ts reasonai-state.spec.ts` (`web/`) | 0 | 166 passed; deterministic unit/state tests | `%TEMP%/reasonai-web-state-final-2026-10-11.log` |
| 08:30:27–08:31:20 | `uv run pytest tests/knowledge/test_api.py tests/knowledge/test_providers.py` (`backend/`) | 0 | 46 passed; test doubles/fixtures | `%TEMP%/reasonai-backend-final-2026-10-11.log` |
| 08:30:27–08:31:23 | `npx --yes node@22 node_modules/typescript/bin/tsc --noEmit` (`web/`) | 0 | Typecheck passed, no diagnostics | `%TEMP%/reasonai-typecheck-final-2026-10-11.log` |
| Earlier attempt, same date | `npx playwright test --config=playwright.system-design-state.config.ts langsmith.spec.ts feed-reasonai.spec.ts dsa-reasonai-agent.spec.ts system-design-reasonai-agent.spec.ts reasonai-state.spec.ts` (`web/`) | 1 | Collection failed: `react-markdown` ESM import was required from CommonJS on this Windows runner. Excluding that spec yielded the 166-pass result above. | `%TEMP%/reasonai-web-state-2026-10-11.log` |
| Earlier attempt, same date | `npx playwright test auth.spec.ts dsa-workspace.spec.ts reasonai.spec.ts --reporter=line` (`web/`) | 1 | Browser suite did not start: Playwright's dev-server gate timed out after 120 s on this runner. | `%TEMP%/reasonai-web-browser-2026-10-11.log` |
| Earlier attempt, same date | `go test ./...` (`realtime/`) | Not launched | `go` command absent from PATH; no Go test result claimed. | No log created |

The Node 22 local dev-server retry reported Ready but `/login` did not finish compilation before the browser attempt timed out; the retry was stopped. No local browser-test pass is claimed. LangSmith tests in the 166-pass group use test keys and deterministic behavior; `LANGSMITH_API_KEY` and tracing were not configured for a live trace. Production app trace IDs in SD-01 are not LangSmith IDs.

## Separate direct provider connectivity checks

[First probe](provider-probe-attempt-1.json) received HTTP 200 from Nemotron Super but produced no visible answer within a 30-token cap; Tavily also returned HTTP 200. [Second probe](provider-probe.json) raised the cap to 200 tokens and received a visible `OK`, with the provider reporting `nvidia/nemotron-3-super-120b-a12b`; Tavily again returned HTTP 200 and two public URL strings. These checks were made directly from the local credentialed checkout, outside the product workflow. They do not establish production model routing, application Tavily tool execution, source support, or a LangSmith trace.
