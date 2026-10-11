# KNOW-01 — source-backed feed research attempts

| Field | Observed value |
| --- | --- |
| UTC timestamp | Live attempts: 2026-10-11 08:17:45–08:17:59, 08:20:35–08:20:48, and 08:23:36–08:23:48 UTC; an Architecture-filter attempt at 08:21:53 found no selectable story within 30 s |
| Git SHA / deployment | `9641835b13d10bdad508c895718481146cbf57de`; production deployment SHA unverified |
| Operator/evaluator | Codex |
| Environment and client | Production Knowledge Feed, fresh Chromium judge contexts, 1600×1000 |
| Execution type | Three **live product requests**, all failed; one filter attempt made no model call |
| Provider / model ID | UI labels the composer Nemotron; no successful production response exposed a concrete model ID |
| Selected/final tier and escalation | Not surfaced |
| Auth mode / starting story | Judge mode. First two requests used “Huawei and Qualcomm Announce Broad Patent License Agreement” with public source `https://www.huawei.com/en/news/2026/10/qualcomm-broad-patent-agreement`. Third used “Digital archive of Tippett Studios’ stop-motion and CGI materials released online” with its source URL in `observed.json`. |
| Prompt | `Find two related technical developments from trustworthy sources and explain how they affect the architecture choices in this story.` |
| Tool calls | None surfaced by the product. **No Tavily product-tool execution was observed.** A separate direct Tavily API probe must not be counted as this workflow. |
| Validation and user action | No cited answer to validate; citation count 0 |
| Actual response and outcome | HTTP 200 event streams began with `run.started` and ended in `run.failed`. Captured attempts 2 and 4 had `INCOMPLETE_RESPONSE`; the UI offered Try again. No supporting source links or Nemotron answer were produced. |
| Wall-clock duration | 9.9 s, 8.9 s, and 9.2 s from send click to stream completion, measured by Playwright `Date.now()`; failure latencies only |
| Rubric | Functional 0, grounding 0, tool/contract 0, utility 0, safety/failure handling 2 = **2/10**. No fabricated citations appeared. |
| Verdict | **Fail** for KNOW-01; no app-level Tavily trace or sourced answer. |
| Known limitations / retries | Attempts 1 and 2 used the first feed story. The Architecture filter yielded no selectable story before timeout. The final request used another actual story and failed the same way. Server-side reason within `INCOMPLETE_RESPONSE` was not exposed. |
| Redaction review | Codex, 2026-10-11 UTC; public JSON and screenshots checked for credentials, identities, private reasoning, and room links |
| Artifacts | [First request](observed-attempt-1.json), [second request](observed-attempt-2.json), [empty-filter attempt](observed-attempt-3.json), [second-story request](observed.json), [story screenshot](../../../screenshots/2026-10-11/knowledge-story.png), [first error UI](../../../screenshots/2026-10-11/knowledge-attempt-1-error.png), [second error UI](../../../screenshots/2026-10-11/knowledge-attempt-2-error.png), [second-story error UI](../../../screenshots/2026-10-11/knowledge-research.png) |

## Reproduction and expected versus actual

Run `node scripts/capture-knowledge-evidence.mjs` from `web/`; `--second-story` selects the second visible feed item. Expected: the attached real story, a Nemotron-selected Tavily `search_web` call, two related developments, and source URLs whose claims can be checked. Actual: all three model requests ended before any surfaced tool invocation or answer. Public URLs from the separate [provider probe](../provider-probe.json) are connectivity evidence only and are not citations for this case.
