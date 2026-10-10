# Evaluation methodology (pre-results protocol)

**Version:** 2026-10-11 initial plan · **Status:** Proposed; no new results captured here.  
**Goal:** Collect small, transparent proof for all four equally weighted Nebius judging criteria without manufacturing numbers.

## Research questions and fair comparisons

| Study | Primary measure | Secondary measure | What it *cannot* establish |
| --- | --- | --- | --- |
| DSA (10 tasks) | Percentage of tasks solved correctly, with and without guided hints | Time, assistance level, complexity explanation score | Long-term learning from a single assisted session |
| System Design (5 scenarios) | Change in rubric-scored architecture quality after ReasonAI feedback | Correctness of accepted recommendations, clarity of trade-offs | Causal improvement from an uncontrolled before/after alone |
| Feed (20 stories) | Supported factual claims / factual claims checked | Freshness, source usability, duplicate rate | Truth of facts that independent sources cannot confirm |
| Realtime (20 scenarios) | Both clients' final document hashes match after quiescence | Recovery time, errors, duplicate operations | Multi-region/high-load reliability |
| Live agent (30 prompts) | Task success / all attempted prompts | Model used, tool calls, duration, errors | General model accuracy beyond the chosen sample |
| UX (5–8 people) | Unassisted task completion / task attempts | Time-to-completion, confusion, satisfaction | Population-wide usability or market demand |

### DSA

Choose 10 tasks of mixed difficulty from the existing catalog; publish exact slugs and expected solutions before running. Compare a standard reference-only path with ReasonAI hint/visual tutor on **matched but different** tasks; alternate the order across people. Record correctness and complexity explanation (0=wrong/missing, 1=partially supported, 2=correct and justified). Participants must not receive private answer keys. Do not confuse 'hint shown' with 'problem solved'.

### System Design

Choose the five [fixed cases](TEST_CASES.md). For each participant/case: save an initial design and written rationale, run ReasonAI Review/Fix/Eagle View, save the final design and each accepted/rejected proposal. A reviewer who does not know which diagram came first grades both with this fixed 10-point rubric:

- Functional requirements covered (0–2)
- Scaling/capacity decisions justified (0–2)
- Reliability/failure paths (0–2)
- Security and data correctness (0–2)
- Trade-off clarity and assumptions (0–2)

For stronger causal evidence, randomize participants to comparable *AI-assisted vs reference-only* cases, counterbalance task order and report both groups. The simple within-person before/after **does not prove** that AI caused all improvement; use 'observed improvement during assisted revision', not 'ReasonAI improves engineers by N%'.

### Feed

Select the first 20 unique published stories in a frozen time window, in deterministic timestamp order, **before reading their claims**. Save original source URL, capture date and story IDs; do not republish copyrighted source bodies. Extract atomic factual claims, use independent authoritative sources, label each `supported`, `contradicted`, or `unverifiable`. Primary denominator = supported + contradicted + unverifiable checked claims; report unverifiable separately. Never call omitted/unverifiable claims correct.

### Collaboration

For every [RT case](TEST_CASES.md), start from a clean room with two browser contexts; capture event/order logs, screenshots and both canonical post-sync document hashes. Define timeout before testing (suggested: 15 s after the final operation on a healthy connection; reconnect cases may allow 30 s). A passing scenario needs expected final state **and** no silently dropped committed operations. Note service is in-memory/single-instance: do not imply restart persistence.

### Live Nemotron agents

Use 10 DSA, 10 System Design and 10 Feed prompts defined *before* execution. Tag each attempt as `automated_live` only after a real Nebius runtime call is evidenced via provider-side request/trace metadata. Capture deployed SHA, sanitized trace/turn IDs, model tier, tool use, response validity, total duration and errors. A synthetic provider mock belongs in `automated_mock`, never `automated_live`.

## Common measurement rules

- **Attempted N** includes errors, timeouts and crashes. Success rate = successful attempts / all attempts; never divide only by completed tasks.
- **Latency** = user request start to terminal completed or failed event. Publish p50 and p95 with a stated method (nearest-rank order statistic is acceptable) and failures separately.
- **Missing data** = `not_measured` / empty; never replace with zero successes or speculative estimates.
- **Exclusions** must be prespecified, counted and explained (e.g., provider outage); publish both full intention-to-test and sensitivity views if relevant.
- **Comparison fairness:** same hardware/browser/environment and time allowance where possible; avoid using different difficulty tasks without adjustment.
- **Study independence:** recruit consenting users, not just the author; document prior experience. When feasible, use an independent blind evaluator.
- **Privacy:** de-identify accounts, redact private diagrams/queries/API keys, retain consent, never export actual private LangSmith messages to public GitHub.
- **Release reproducibility:** every aggregate links to case IDs, date, repo SHA, environment and anonymized raw row(s).
- **Transparency:** include failure cases and limitations next to favorable findings, not in a hidden appendix.

## Scoring evidence, not manipulating judges

Nebius's four criteria are **judge-assigned**. Do not present self-assigned rubric scores as official Nebius judging scores. Evaluation outcome numbers are product measurements; they are distinct from the hackathon 1–5 score.

## Review checklist before publishing numbers

- [ ] Test cases and rubrics locked before results
- [ ] Sample size, model, deployment SHA, environment recorded
- [ ] Separate real model traces from fake responses
- [ ] All attempted cases and failures included
- [ ] Any percentage contains raw numerator / denominator
- [ ] Baseline and evaluator independence disclosed
- [ ] Personally identifying information and secrets removed
- [ ] Public README/Devpost/video claims match published results exactly
