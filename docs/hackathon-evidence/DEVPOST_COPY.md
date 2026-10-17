# Devpost — evidence section (publish only after verification)

Use this copy under **Validation and Measured Impact**. It deliberately contains **no invented benchmark numbers**. Replace bracketed prompts only after real test results exist.

## What we validated

ReasonAI is designed to help developers move from discovering technical ideas, to reasoning about architecture trade-offs, to practicing algorithms. Our technical proof focuses on real NVIDIA Nemotron inference via Nebius Token Factory, bounded tool workflows and user-controlled architecture changes—not a standalone chat response.

Our public [evaluation pack](https://github.com/saksham60/recallstack/tree/main/docs/hackathon-evidence) documents the testing protocol, fixed scenarios, historical engineering checks, limitations and anonymized outcome data when available. Historical unit/browser tests are reported separately from production calls and user studies.

### Engineering evidence already documented

- The repo documents bounded model/tool loops, streamed Nemotron completion, Tavily research and schema-checked architecture analyses: [technical design verification](https://github.com/saksham60/recallstack/blob/main/web/docs/system-design-reasonai.md).
- It implements model/tool tracing with redaction and includes tests for tracing behavior: [instrumentation](https://github.com/saksham60/recallstack/blob/main/web/src/lib/reasonai/server/langsmith.ts).
- The Go realtime service implements single-room ordered operations and reconnect logic, with explicit single-instance memory limitations: [realtime service](https://github.com/saksham60/recallstack/tree/main/realtime).

### Measured outcomes — fill only after execution

| Question | Verified result |
| --- | --- |
| Can real Nebius/Nemotron calls complete the intended agent workflow? | **Pending live deployment verification** |
| Does AI review improve scored System Design artifacts in our study? | **Pending controlled evaluation** |
| Are Knowledge Feed claims supported by sources? | **Pending source audit** |
| Do two collaborators converge on the same canvas state? | **Pending scenario run** |
| Can newcomers complete the key product journey without help? | **Pending usability study** |

**What to show judges:** one unscripted end-to-end trace, one initial/final architecture comparison, one failure-handling example and a view of anonymized results with numerator/denominator. Do not replace the pending labels with '100%' unless every recorded attempt truly succeeds.

**Honest limitations:** a small usability sample is not proof of population-level learning; observational before/after changes are not automatically causal; realtime rooms are single-instance and in-memory; test mocks are not Nebius provider verification.

### Ready-to-use video caption template

“ReasonAI uses NVIDIA Nemotron on Nebius Token Factory to turn technical questions into guided learning, reviewable architecture proposals and grounded research. Here is a real [model/tool] run, followed by a measured [evaluation], including its [sample size] and [observed result].”

Only narrate figures after checking the published raw evidence.
