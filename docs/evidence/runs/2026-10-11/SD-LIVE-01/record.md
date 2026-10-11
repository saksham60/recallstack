# SD-LIVE-01 — Fresh-canvas AI proposal: production tool and database verification

> **Result: PASS for AI proposal generation and durable *pending-proposal* persistence; NOT VERIFIED for user acceptance or standalone canvas restoration.** This is a later, exploratory production trial, **not** a retroactive pass for the fixed messaging prompt in [SD-01](../SD-01/record.md).

| Field | Observed value |
| --- | --- |
| Case ID / title | SD-LIVE-01 — standalone fresh canvas, five components and four links |
| UTC timestamp | 2026-10-11 13:32:09.801 (request received); 13:32:37.836 (`reasonai.run.completed` log) |
| Commit / deployment | `462e72f33f4a56de4f61302b4fa73b8af767a72c` / Vercel `dpl_5psDotQG58DeToB2pCM4kyobKdxp`, production `main` |
| Evaluator / provenance | User-operated production web session; later read-only verification through connected Vercel runtime logs and Supabase SQL by ChatGPT |
| Execution type | **Live production** model/tool workflow and read-only production database inspection; not a mocked E2E test |
| Surface / starting state | New standalone System Design canvas, diagram `diagram_e2af0eb2-c223-4ea7-9cfd-05b786381b24`; prompt requested creation from scratch |
| Provider/model observation | `reasonai.model.selected`: preference `auto`, model tier `super`, final tier `super`. The application's server registry maps Super to `nvidia/nemotron-3-super-120b-a12b`; the exact provider ID was **not independently returned in the captured runtime logs for this request**. |
| Tool execution | `propose_canvas_changes`: first attempt, `tool.completed`, reported execution `durationMs: 3`; no tool retry in the observed run |
| Graph / UI task outcome | `reasonai.run.completed` with `taskOutcome: awaiting_approval`, `modelsUsed: ['super']`, `finalModel: 'super'` |
| Measured duration | **23,499 ms**, application-reported `reasonai.run.completed.durationMs` (not browser wall-clock latency and not a multi-sample benchmark) |
| Database outcome | `public.reasonai_runs` status `completed`, `last_seq=37`, `error_code=NULL`; `public.reasonai_conversation_state` version **1**, `last_run_id` equal to this run; `pendingProposal.status=pending`, **9 operations** |
| Proposal contents | **5 `add_node` operations** (Web Application, API Gateway, Backend Service, PostgreSQL Database, Redis Cache) and **4 `add_edge` operations**, verified by read-only SQL against the saved pending proposal |
| User approval | **Not verified**: database showed **0** proposal-acceptance/event receipts. `awaiting_approval` means approval is pending, not that changes were accepted. |
| Canvas persistence after refresh | **Failed / unsupported in the tested standalone editor**: user reported the canvas disappeared on refresh. The standalone editor sets `useSystemDesignPersistence.enabled = Boolean(problem)`, which is false for a standalone canvas. The saved **ReasonAI proposal** and the editor's **canvas document** are separate persistence boundaries. |
| Tracing | Application trace ID `11262090-7c7a-45e0-b724-503cd585549f`; Vercel reports `langsmith.flush.completed`, not by itself proof of a retrievable LangSmith span for this exact run |
| Redaction | Sanitized values only: no access tokens, credentials, raw prompts from third parties, user IDs, room secrets, or model-private reasoning |
| Screenshot / artifact availability | No publicly archived screenshot independently matched to **this** run; this record is supported by the Vercel event sequence and Supabase query results below. Earlier screenshots of separate runs must not be represented as this run. |
| Overall verdict | **Partial product milestone**: AI → typed tool → 9-operation validated proposal → PostgreSQL pending-proposal persistence **verified**. Accept All → durable standalone diagram → reload **not verified**, and should not be counted as completed. |

## Task supplied to the live app

```text
Create a simple scalable web application architecture from scratch.

Add these 5 components:
1. Web Application
2. API Gateway
3. Backend Service
4. PostgreSQL Database
5. Redis Cache

Connect them as follows:
- Web Application → API Gateway
- API Gateway → Backend Service
- Backend Service → PostgreSQL
- Backend Service → Redis Cache

Generate actual reviewable canvas suggestions for all 5 nodes and 4 connections.
Do not apply any changes until I approve.
```

## Sanitized live runtime observations

All times UTC on 2026-10-11. These are selected, observed telemetry fields, not invented replay or synthetic events.

| Time | Stage | Sanitized observation |
| --- | --- | --- |
| 13:32:09.801 | Request | `REQUEST_RECEIVED`, trace `11262090-7c7a-45e0-b724-503cd585549f` |
| 13:32:14.418 | Provider | Model preference `auto`, selected `super` |
| 13:32:36.303–13:32:36.319 | Tool | `propose_canvas_changes` started then completed, attempt 1, execution time 3 ms |
| 13:32:37.836 | Final result | `reasonai.run.completed`, `taskOutcome: awaiting_approval`, `durationMs: 23499` |
| 13:32:38.557 | Tracing | `langsmith.flush.completed` reported with pending count 0 |

Vercel request ID (for authorized log lookup): `fpfxr-1791725528455-ad12afe1c608`.

## Read-only production database verification

A read-only SQL inspection of the persisted run and conversation state established:

```json
{
  "runId": "0e396cbe-00df-4567-9f29-5db2d4beaa01",
  "runStatus": "completed",
  "errorCode": null,
  "lastSeq": 37,
  "conversationStateVersion": 1,
  "conversationStateLastRunId": "0e396cbe-00df-4567-9f29-5db2d4beaa01",
  "pendingProposalStatus": "pending",
  "pendingProposalOperations": 9,
  "recordedProposalActions": 0
}
```

Aggregated, read-only validation of pending operations:

```text
add_node: 5
  Web Application
  API Gateway
  Backend Service
  PostgreSQL Database
  Redis Cache

add_edge: 4
  new:webapp  → new:apigw
  new:apigw   → new:backend
  new:backend → new:postgres
  new:backend → new:redis
```

No database mutation was performed during the evidence inspection.

## Reproduction and limitations

1. On the deployment above, open a **fresh standalone System Design canvas**.
2. Enter the exact task prompt above with model preference **Auto**.
3. Wait for the streaming response; the server-side log is `awaiting_approval`, and the proposal is stored as a pending artifact in Supabase.
4. Inspect `reasonai_runs`, `reasonai_conversation_state`, and `reasonai_proposal_events` using authorized **read-only** queries. Do not treat server-side saved proposal operations as already-applied editor nodes.
5. For a **separate future test**, use a **saved problem diagram** to evaluate Accept All and refresh. The standalone editor presently does not persist standalone canvas documents; a reload may discard the editor state even when the ReasonAI pending proposal has been saved.

**Not comparable to SD-01:** This task was a simpler five-component fresh-canvas prompt; the earlier SD-01 messaging-scale task failed in its captured live attempts. No combined success rate or model comparison is inferred. An operator screenshot of another later production run showed `Canvas suggestions ready`, but it is not archived or claimed as a same-run capture here.
