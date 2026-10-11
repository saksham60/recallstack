# DSA-01 — 3Sum hint and visual walkthrough

| Field | Observed value |
| --- | --- |
| UTC timestamp | Hint: 2026-10-11 08:12:50–08:14:34; visual runs: 08:16:17–08:16:53 and 08:35:32–08:36:09 UTC |
| Git SHA / deployment | `9641835b13d10bdad508c895718481146cbf57de`; production deployment SHA unverified |
| Operator/evaluator | Codex |
| Environment and client | Production web app, fresh Chromium judge contexts, 1600×1000 |
| Execution type | **Live product model calls**, separate hint and visual requests |
| Provider / model ID | UI labels the tutor Nemotron; the production response did not expose a concrete model ID. Source defaults and a separate direct probe indicate Nemotron Super locally, but do not prove the deployed selection. |
| Selected/final tier and escalation | Not surfaced by DSA response |
| Auth mode / seeded data | Judge mode; actual catalog item `/dsa/problem/ultimate-dsa-016-3sum`, medium, Arrays, linked to `https://leetcode.com/problems/3sum/` |
| Prompt | UI action 1: **Give me a hint**. UI action 2: **Visual walkthrough**, which sends a short step-by-step visual request bounded to the current progress. These actions differ from the runbook's combined seed wording. |
| Tool calls | Both completed visual requests emitted `tool.started` for `create_visual`, `tool.completed`, `visual.ready` with kind `array`, `text.final`, and `run.completed`. No Tavily call was observed. Latest app run ID `41ffe4e2-391c-4a3b-b3a4-dfffaa98e025`; tool call ID `chatcmpl-tool-ad03479128bd492e`. These are app IDs, not LangSmith IDs. |
| Validation and user action | Server emits `visual.ready` after `parseVisualLesson` validates the tool payload. The client rendered seven steps on the first completed visual run and six payload steps on the second. No code solution was requested or entered. |
| Actual response and outcome | Hint: fix one element, seek its complement pair in an ordered array. The first completed visual omitted an intermediate pointer state. The second correctly showed the unsorted input and sorting, but its text called `[-4,-1,2]` a valid zero-sum triplet even though it sums to `-3`, and listed seven prose steps for a six-step visual. |
| Wall-clock duration | Hint duration is **not reportable**: first capture included a response-listener race. Completed visual runs took 32.7 s and 32.7 s from click to stream completion using `Date.now()` in Playwright; two samples, no distribution claim. |
| Rubric | First completed visual: functional 1, grounding 2, tool/contract 2, utility 1, safety/failure handling 2 = **8/10**. Second visual: functional 0, grounding 1, tool/contract 2, utility 0, safety/failure handling 1 = **4/10**. Hint quality was observed separately. |
| Verdict | **Partial UI/tool success; DSA-01 quality fail.** The hint and validated visual rendering are real, but neither visual is an accurate complete trace, and the second includes a false triplet. |
| Known limitations / retries | First visual screenshot was taken while still streaming and is not used as final visual proof. First network-body capture failed with a Playwright streaming-body error. Two fresh visual-only runs completed. No LangSmith ID or concrete production model ID was accessible. |
| Redaction review | Codex, 2026-10-11 UTC; no credentials, personal data, private reasoning, or room link in artifacts |
| Artifacts | [Initial run](observed.json), [first completed visual](observed-visual-attempt-1.json), [second completed visual and app IDs](observed-visual-retry.json), [problem](../../../screenshots/2026-10-11/dsa-before.png), [hint](../../../screenshots/2026-10-11/dsa-hint.png), [first visual](../../../screenshots/2026-10-11/dsa-visual-attempt-1.png), [second visual](../../../screenshots/2026-10-11/dsa-visual.png) |

## Reproduction and expected versus actual

Run `node scripts/capture-dsa-evidence.mjs` from `web/` for the UI hint and visual actions; `--visual-only` captures a completed visual separately. Expected: one non-spoiling hint and an accurate trace for the six-number example. Actual: the hint was useful and visual payloads rendered, but one trace skipped a pointer state and the other contained a false triplet.
