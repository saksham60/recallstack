# SD-01 — messaging architecture proposal attempt

| Field | Observed value |
| --- | --- |
| UTC timestamp | Attempt 1: 2026-10-11 08:18:30–08:19:12; attempt 2: 08:22:02–08:22:44 UTC |
| Git SHA / deployment | `9641835b13d10bdad508c895718481146cbf57de`; production deployment SHA unverified |
| Operator/evaluator | Codex |
| Environment and client | Production web app, fresh Chromium judge session, standalone System Design canvas, 1600×1000 |
| Execution type | Live product requests; **failed** |
| Provider / model ID | UI selected Auto, then explicit Super. No successful model metadata or provider response established a production model ID. A separate direct local probe is not evidence for these app calls. |
| Selected/final tier and escalation | Auto in attempt 1; Super in attempt 2. Final tier and escalation unavailable because both failed. |
| Auth mode / seeded data | Judge mode; imported test-only 3-node, 2-edge messaging canvas from `observed-attempt-1.json` |
| Starting state | Mobile clients → Chat service → Message store; three nodes and two connections |
| Prompt | `Design a messaging platform for one million concurrent users. Review the current diagram for bottlenecks and propose missing components and links.` |
| Tool calls | None surfaced. No `artifact.proposal` event. |
| Validation and user action | Imported document was accepted by the canvas validator. Proposal preflight, acceptance, discard, and after-canvas steps could not run. |
| Actual response and outcome | HTTP 200 NDJSON containing `run.started` then `run.failed`; second attempt code `PROVIDER_FAILURE`. UI said ReasonAI was temporarily unavailable. Canvas remained 3 nodes and 2 connections. |
| Wall-clock duration | 39.4 s and 39.2 s from send click to stream completion, measured by Playwright `Date.now()`; two samples only |
| Rubric | Functional 0, grounding 0, tool/contract 0, utility 0, safety/failure handling 2 = **2/10**. The bounded failure did not mutate the canvas. |
| Verdict | **Fail** for SD-01. No proposal or accepted final canvas was observed. |
| Known limitations / retries | Two live attempts. First trace ID `81b0bd51-8b19-4f3e-a5d7-33a1b4cad5f4`; second `b7a8161f-f085-46ec-8d12-dabb5e728803`. These are app trace IDs, not LangSmith trace IDs. Provider-side failure detail was not available. |
| Redaction review | Codex, 2026-10-11 UTC; public JSON and screenshots reviewed; no credentials, identities, cookies, private room links, or private reasoning |
| Artifacts | [Attempt 1](observed-attempt-1.json), [attempt 2](observed.json), [before](../../../screenshots/2026-10-11/system-design-before.png), [first error UI](../../../screenshots/2026-10-11/system-design-attempt-1-error.png), [second error UI](../../../screenshots/2026-10-11/system-design-proposal.png) |

## Reproduction and expected versus actual

Run `node scripts/capture-system-design-evidence.mjs` from `web/`; pass `--super` for the second configuration. The script imports the documented seed through the UI, asks the fixed prompt in Improve mode, and waits for the response. Expected: a typed, preflight-validated proposal awaiting explicit acceptance, an unchanged canvas after discard, and an applied canvas after acceptance. Actual: both model requests failed before proposal generation. The UI and counts show the seed remained unchanged; no acceptance or discard result is claimed.
