# Evidence capture runbook — ReasonAI

This runbook is for an engineer or Codex operating an **authorized** browser and development environment. The collector must run ReasonAI; screenshots or traces invented by a text/image model do **not** count.

## Preconditions

- Work from a named Git commit and record the SHA, UTC timestamp, deployment environment, and enabled ReasonAI configuration (names/tiers only; **never credentials**).
- Verify [Judge mode](https://www.reasonai.tech/login) works from a fresh unauthenticated browser session; record success/failure. If it does not, capture the failure rather than claiming judge access works.
- Use test accounts/test-only diagrams and non-sensitive engineering prompts. Avoid customer data, personal conversations and private source documents.
- For each run, record whether inference really contacted **Nebius Token Factory / NVIDIA Nemotron**, or was mocked. E2E tests with mocked responses must be marked **mocked**.
- Disable display of confidential authentication/network headers and redact user IDs or identities in any exported LangSmith trace.

## A — System Design: AI proposes; the engineer decides

**Seed prompt:** `Design a messaging platform for one million concurrent users. Review the current diagram for bottlenecks and propose missing components and links.`

1. Record a clean starting canvas with readable node labels; keep the same diagram/session for the full capture.
2. Record model tier, request timestamp, task mode, response status, requested tools, and typed proposal output. If Auto escalates, capture actual reported tier/sequence, not an inference.
3. Save evidence of the **preflight validation result**: accepted/rejected operations and explicit reasons. Never directly apply unreviewed AI output.
4. Capture **before**, **proposal review UI**, **after acceptance** screenshots. Include evidence that a discarded proposal does **not** change the canvas.
5. Measure proposed/valid/applied/rejected operation counts, and fill in the evaluation rubric. Do not call this a million-user load test; that prompt is an architecture design exercise, not a concurrency benchmark.

**Suggested artifacts:** `screenshots/system-design-before.png`, `screenshots/system-design-proposal.png`, `screenshots/system-design-after.png`, `runs/YYYY-MM-DD/SD-01/record.md`, sanitized trace JSON/text.

## B — DSA: help without immediately revealing the solution

**Seed prompt:** `I'm stuck on 3Sum. Give me only the next useful hint, without showing code or the complete solution. Then explain the two-pointer invariant and show a visual trace for [-1, 0, 1, 2, -1, -4].`

1. Start on the real 3Sum problem page. Record its slug, problem constraints, model tier, and current agent/memory configuration.
2. Capture the prompt, progressive hint, model output, requested tool names and structured visual payload if emitted.
3. Judge the hint for non-spoiling guidance, correctness, and relevance. If the visual cannot be prepared, record that outcome, rather than using a mocked visualization.
4. Record final screenshots, request duration and any parse errors or retries.

**Suggested artifacts:** `screenshots/dsa-hint.png`, `screenshots/dsa-visual.png`, `runs/YYYY-MM-DD/DSA-01/record.md`.

## C — Knowledge Feed: evidence-grounded story research

**Seed prompt:** `Find two related technical developments from trustworthy sources and explain how they affect the architecture choices in this story.`

1. Select a real feed story and record its title and URL (do not copy a source article in full).
2. Record the actual selected story ID/reference, Tavily tool invocation and returned source URLs, Nemotron response and cited output.
3. Check each cited URL resolves and supports the claim attributed to it.
4. Record whether this was a **real Tavily call** or a deterministic test stub and keep them separate.

**Suggested artifacts:** `screenshots/knowledge-story.png`, `screenshots/knowledge-research.png`, `runs/YYYY-MM-DD/KNOW-01/record.md`.

## D — Realtime collaboration (different proof from inference)

1. Start two separate authorized browsers/profiles in the **same live room**; take a before screenshot.
2. Add a node and connection in session A; verify it appears in session B. Record operation IDs/ACKs where supported.
3. Move one node in B; observe convergence. Reconnect B and verify the resumed state.
4. Record the actual room/server topology (the submitted Go service is **single instance / in memory**). Do not claim distributed multi-region collaboration or production load capacity.

## E — Automated test execution

In a checked-out repo with prerequisites installed, run the appropriate commands documented in [Development and Verification](../DEVELOPMENT.md#verification). Capture complete output, exit codes, UTC timestamp, SHA and runner environment. Some browser tests require a dev server, seeded database, configuration or credentials. Report skipped/missing prerequisites as such.

## Privacy and public artifacts

- **Never publish:** `NEBIUS_API_KEY`, `TAVILY_API_KEY`, `LANGSMITH_API_KEY`, Supabase service-role secrets, cookies, bearer tokens, invite capabilities, emails, private profile data or full private reasoning traces.
- It is acceptable to publish **sanitized** prompt/response excerpts, tool names, validated node/edge operation counts, model IDs, timings, public citation URLs and screenshots of seeded test data.
- Respect provider terms and minimize raw logs. Before committing, manually inspect every PNG/video/log/JSON for secrets and identifying data.
- For each evidence file link, cite the exact commit/run date and record whether the execution was **live** or **mocked**.

Only once real files exist should the root [README](../../README.md) and the [Evidence Hub](INDEX.md) claim verified measurements.
