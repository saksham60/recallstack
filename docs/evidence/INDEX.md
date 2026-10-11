# ReasonAI — Hackathon Evidence Hub

> **Status: Evidence collection in progress.** This index separates inspectable implementation from **execution evidence** and **unmeasured claims**. Source code and test cases existing in GitHub are not proof that any particular production run succeeded.

**Project:** [ReasonAI](https://www.reasonai.tech) · [3-minute demonstration](https://www.youtube.com/watch?v=FoV2KkK72Xs) · [Devpost](https://devpost.com/software/reasonai) · [Judge walkthrough](../../README.md#judge-quickstart--try-it-in-five-minutes) · [Full architecture](../ARCHITECTURE.md).

## Evidence coverage

| Area | Currently inspectable | Capture required before claiming measured success | State |
| --- | --- | --- | --- |
| **Sponsor integration** | [Nebius/Nemotron runtime map](../../HACKATHON_SUBMISSION.md), [System Design agent details](../../web/docs/system-design-reasonai.md) | Sanitized live provider request metadata and associated Nemotron response/trace | Source available; live artifact pending |
| **System Design AI** | [Typed proposals and recovery](../../web/docs/reasonai-proposal-recovery.md), [browser test cases](../../web/e2e/reasonai.spec.ts) | Prompt + actual canvas state → model proposal → validation → user acceptance → after screenshot | Source available; run pending |
| **DSA tutoring** | [DSA workspace](../../web/docs/dsa-workspace.md), [agent test cases](../../web/e2e/reasonai.spec.ts) | Complete hint/tool/visual trace and quality grading on fixed problems | Source available; run pending |
| **Knowledge Feed** | [Pipeline](../../backend/docs/knowledge-shorts.md), [API tests](../../backend/tests/knowledge/test_api.py) | Actual story→research tool→cited answer sequence, redacted source IDs | Source available; run pending |
| **Realtime collaboration** | [Go service](../../realtime/README.md), [room tests](../../realtime/internal/room/room_test.go) | Two authenticated sessions, shared edit, screenshot/video, logs and reconnect case | Source available; run pending |
| **Tracing / observability** | [LangSmith integration tests](../../web/e2e/langsmith.spec.ts) | Real sanitized LangSmith parent/child trace, model/tier and tool calls, with timestamps | Source available; run pending |
| **Automated verification** | [Documented commands](../DEVELOPMENT.md#verification) | Dated execution logs for web, backend, Go, and Flutter, including failures and exclusions | Commands available; run pending |
| **User impact** | [Product demonstration](https://www.youtube.com/watch?v=FoV2KkK72Xs) | Consented user tasks, observed results and verbatim or attributed feedback | Not measured |

## Capture the evidence

1. Follow [CAPTURE_RUNBOOK.md](CAPTURE_RUNBOOK.md) to obtain real, reproducible product traces and screenshots; **do not generate mock screenshots as evidence**.
2. Follow [EVALUATION_PROTOCOL.md](EVALUATION_PROTOCOL.md) for fixed prompts, objective checks, rubric scoring and reporting rules.
3. Record each run using [RUN_RECORD_TEMPLATE.md](RUN_RECORD_TEMPLATE.md), including commit SHA, model name, timestamps, expected and actual outcomes, and redactions.
4. Store reviewed reports under `docs/evidence/runs/YYYY-MM-DD/<case-id>/` and screenshots under `docs/evidence/screenshots/`. Do not commit session cookies, authorization headers, API tokens, personal details or full private model reasoning.
5. Update this page's state and link **only after** an artifact exists and has been checked.

## Reporting rules

- Label **unit/E2E tests**, **real live model runs**, and **subjective reviewer assessment** separately.
- Include failures and attempts, not just the best result; fix rubric definitions before comparing models.
- Report latency, cost, throughput, win rate or accuracy **only when the measurement source and sample size are recorded**.
- The existing [README](../../README.md) distinguishes deployed capabilities from the roadmap. Nebius Sandboxes execution, GitHub-to-canvas, distributed durable realtime, and external MCP editing are **not** presented as completed features.

**Next evidence milestone:** one fully reproducible System Design run, then one DSA run, one Knowledge Feed research run, and a two-client collaboration recording.
