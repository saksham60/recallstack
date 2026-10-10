# Fixed test-case plan — to execute, not results

**All cases below are pending.** If a case is inapplicable to the deployed application, record a `blocked` attempt and explain; do not quietly substitute another success. Freeze problem slugs and expected outputs in the evaluation run manifest before testing.

## DSA — 10 tasks (DSA01–DSA10)

| ID | Topic / sample task | Evaluate |
| --- | --- | --- |
| DSA01 | Two Sum (hash map) | Correctness and O(n) time explanation |
| DSA02 | Valid Parentheses (stack) | Invariant and failure explanation |
| DSA03 | Merge Intervals (sorting) | Boundary cases |
| DSA04 | Binary Search | Off-by-one handling |
| DSA05 | Reverse Linked List | Pointer-state reasoning |
| DSA06 | Number of Islands | Graph traversal and complexity |
| DSA07 | Course Schedule | Cycle detection and topological ordering |
| DSA08 | Lowest Common Ancestor | Tree reasoning |
| DSA09 | Coin Change | DP recurrence and impossibility |
| DSA10 | LRU Cache | O(1) operations and trade-offs |

Do not assume all named problems exist in the current catalog; resolve real slugs first and log any substitutions *before* collecting results.

## System Design — 5 scenarios (SD01–SD05)

| ID | Design prompt | Required checks |
| --- | --- | --- |
| SD01 | Build a multi-tenant URL shortener at growing scale | ID collision, hot redirects, cache, availability |
| SD02 | Design a realtime team chat service | Ordering, reconnect, presence, retention |
| SD03 | Design a notification delivery platform | Idempotency, retries, DLQ, preferences |
| SD04 | Design a distributed cache | Consistency, eviction, failures, sharding |
| SD05 | Design a high-volume personalized content feed | Ranking, freshness, caching, event ingestion |

For each record: original diagram, initial rationale, review prompt, ReasonAI response, accepted/rejected proposals, final diagram and blinded 10-point rubric scores.

## Feed — 20 sampled stories (FEED01–FEED20)

Select per [METHODOLOGY.md](METHODOLOGY.md), not by selecting the best-looking stories. For each: source URL/date, model-enriched claims, check of supporting references, factual claim labels, related-story research outcome and whether the source image is relevant. Record an empty/no-claims story as `not_applicable` plus a reason, not as 100% grounded.

## Realtime — 20 scenarios (RT01–RT20)

| IDs | Scenarios |
| --- | --- |
| RT01–RT05 | Both clients join; create node; move node; add edge; delete node |
| RT06–RT10 | Simultaneous different-node edits; same-node contention; duplicated op ID; operation ACK; cursor/presence |
| RT11–RT15 | One client disconnects; reconnect with replay; reconnect after compaction; stale snapshot; oversized operation rejected |
| RT16–RT20 | Rate-limit response; slow client; leave and rejoin; undo local edit vs shared state; compare final document hashes |

State convergence applies only to operations the product promises to synchronize. Transient cursor previews must not be treated as committed document mutations. Current rooms do not persist through Go process restarts.

## Live Nemotron — 30 prompts (AGENT01–AGENT30)

| Range | Selection plan | Success definition |
| --- | --- | --- |
| AGENT01–10 | 10 DSA context tasks: hints, complexity, edge-case review, visual request | Requested help is relevant, safe, usable and model/tool trace completes |
| AGENT11–20 | 10 System Design tasks: requirements critique, review, bottleneck, security, cost, research, proposal | Valid output attached to actual diagram nodes/edges; user approval boundary respected |
| AGENT21–30 | 10 Feed tasks: summary, follow-up, fresh update, similar story, counterclaim, source comparison | Source-grounded response; needed Tavily research invoked or explicit uncertainty |

Before running, write exact 30 messages in the run manifest. Use fixed prompt wording across comparison settings and record error cases. Do not fill in imagined completions.

## Usability tasks

1. Enter judge mode without author guidance.
2. Open a story and explain one technical takeaway with Ask ReasonAI.
3. Create a System Design diagram, request an AI review, and decide whether to apply a suggestion.
4. Invite a second participant and observe synchronized canvas changes.
5. Start a DSA problem, request a hint, and explain complexity.

Capture success without hints, any human intervention, elapsed time and points of confusion.
