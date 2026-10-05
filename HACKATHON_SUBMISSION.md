# ReasonAI — Nebius × NVIDIA Global AI Hackathon

**Submission track:** Best Apps and Agents  
**Live product:** https://www.reasonai.tech  
**Primary sponsor runtime:** Nebius Token Factory  
**NVIDIA model family:** Nemotron 3 — Lightning, Super and Ultra  
**License:** MIT

ReasonAI is an AI-native technical reasoning workspace for developers, engineering students and architects. It combines guided DSA learning, AI-assisted system design, live collaborative architecture work, grounded research, an AI-enriched engineering Knowledge Feed, durable learning state and a native Flutter experience.

## Why Nebius + NVIDIA are core to the product

Nebius Token Factory is the server-side model-serving boundary for the current ReasonAI product. The web runtime and the offline Knowledge enrichment job use NVIDIA Nemotron through the OpenAI-compatible Token Factory API; provider credentials never enter browser or Flutter bundles.

| Product path | Nebius / NVIDIA usage |
| --- | --- |
| DSA ReasonAI | Nemotron powers tutoring, progressive hints, review, complexity reasoning and structured tool calls inside a bounded LangGraph agent loop. |
| System Design ReasonAI | Nemotron reasons over the current architecture and can request bounded research, semantic architecture analysis or reviewable canvas proposals. The System Design runtime supports Auto plus explicit Lightning / Super / Ultra model preferences with server-owned provider IDs. |
| Knowledge Story Chat | Nemotron streams story-grounded answers and can request bounded Tavily `search_web` for fresh developments, related stories and external verification. |
| Knowledge refresh job | Nemotron performs offline structured enrichment before prepared stories enter the deterministic online feed. |

Canonical provider configuration is documented in [`README.md`](README.md) and [`web/README.md`](web/README.md). The default general ReasonAI runtime configuration remains Super:

```dotenv
NEBIUS_API_KEY=YOUR_NEBIUS_API_KEY
REASONAI_MODEL=nvidia/nemotron-3-super-120b-a12b
REASONAI_BASE_URL=https://api.tokenfactory.nebius.com/v1
```

### Verified System Design model tiering

System Design exposes friendly model preferences while keeping concrete provider IDs on the server:

| Tier | Token Factory model |
| --- | --- |
| Lightning | `nvidia/Nemotron-3_5-Lightning` |
| Super | `nvidia/nemotron-3-super-120b-a12b` |
| Ultra | `nvidia/Nemotron-3-Ultra-550b-a55b` |
| Auto | Starts with Super and can escalate a qualifying reasoning turn to Ultra when the model requests deeper reasoning. |

The selected preference, models used, final tier and whether escalation occurred are carried as runtime metadata rather than inferred from model-generated text. Explicit Lightning, Super and Ultra selections and Auto behavior are covered by the System Design test suite and were exercised against the submitted implementation.

The Knowledge job uses the corresponding `KNOWLEDGE_MODEL` and `KNOWLEDGE_MODEL_BASE_URL` settings documented in [`backend/README.md`](backend/README.md).

## Significant work completed during the hackathon submission period

ReasonAI existed before the hackathon submission window. The project was substantially extended after the August 26, 2026 start of the submission period. The repository history documents those changes, including:

- a dedicated Go realtime collaboration service and browser Live Share integration with ordered operations, ACKs, bounded replay, presence and reconnect handling;
- Nebius Token Factory + NVIDIA Nemotron integration for interactive ReasonAI workloads;
- verified System Design model selection across Nemotron Lightning / Super / Ultra, including an Auto mode that starts on Super and can escalate qualifying reasoning turns to Ultra;
- LangGraph-based DSA and System Design agents with bounded tool loops, streaming events, durable run lifecycle handling and idempotent replay;
- persistent bounded DSA conversation state plus optional cross-conversation learner memory;
- validated DSA visual lessons and reviewable System Design architecture analysis/canvas proposals;
- the Knowledge Feed ingestion pipeline with Tavily/Hacker News discovery, offline Nemotron enrichment, R2 media handling, deterministic ranking and per-user preferences/events;
- Ask ReasonAI for Knowledge stories with model-selected Tavily research and verified external source URLs;
- a native Flutter mobile application for Knowledge Feed, DSA, Ask ReasonAI, review, library and profile flows;
- judge-mode access, provider/tool-call compatibility hardening, citation handling, telemetry, CI coverage and end-to-end architecture documentation.

The repository deliberately marks roadmap items as future work rather than presenting them as completed hackathon functionality. Examples include distributed durable realtime rooms, learned behavioral feed affinity, full System Design on mobile and Git repository → editable architecture canvas.

## Judge path

For the fastest product evaluation:

1. Open https://www.reasonai.tech.
2. Select **Continue as Hackathon Judge**.
3. Open a DSA problem and ask ReasonAI for a hint, trace, explanation or visual walkthrough.
4. Open System Design and try Chat / Review / Fix / Eagle View. Use the model selector to try Auto, Lightning, Super or Ultra. Ask a current cloud/provider question to exercise grounded research, then request architecture analysis or a change proposal. AI suggestions remain inert until explicitly accepted.
5. Start Live Share and open the room in a second browser/device to observe presence, ordered canvas operations and reconnect behavior.
6. Open Knowledge Feed, inspect an AI-enriched story, use Ask ReasonAI and try a freshness/related-content prompt such as **“Show me more like this”**.
7. Use the Flutter client for the mobile Knowledge/DSA experience when evaluating the native client surface.

## Local reproduction

The root [`README.md`](README.md) is the canonical end-to-end setup guide. Component-level setup and verification commands are maintained in:

- [`web/README.md`](web/README.md)
- [`backend/README.md`](backend/README.md)
- [`realtime/README.md`](realtime/README.md)
- [`mobile/README.md`](mobile/README.md)

All populated API keys, database credentials and judge credentials are deployment/local environment values and must not be committed.

## Nebius / NVIDIA developer feedback

### What worked well

- The OpenAI-compatible Token Factory interface made it practical to keep one server-side provider boundary while supporting streaming ReasonAI turns, structured tool calls, multiple Nemotron tiers and offline Knowledge enrichment.
- Nemotron works well as a shared reasoning layer across very different product surfaces: tutoring, architecture reasoning, story synthesis and structured enrichment.
- The available Lightning / Super / Ultra tiers made it possible to expose an explicit quality/latency choice while also supporting an Auto path that begins with Super and can escalate to Ultra for deeper System Design reasoning.
- Keeping provider execution server-side made the security boundary straightforward: browser and mobile clients only call authenticated ReasonAI routes and never receive the Nebius credential.

### Where the developer experience could improve

- Model discovery and model-version availability were the main integration friction. During development an older Nemotron Ultra identifier returned `404`, so the runtime model list had to be checked before selecting the currently available model. Clearer model lifecycle/deprecation guidance and account/region-specific availability would reduce churn.
- Image-generation endpoint/model availability also proved less predictable than text inference, so the submitted product keeps Knowledge imagery on the source-image + validation + R2 pipeline instead of claiming Token Factory image generation.
- Streaming OpenAI-compatible tool-call payloads required defensive parsing because tool-call fragments can arrive incrementally. More provider-specific examples for streamed tools and reasoning/content fields would make agent integration faster.

The current submission therefore uses model IDs and a Lightning / Super / Ultra tiering strategy that have been exercised by the application. It deliberately avoids claiming media-generation paths that are not part of the submitted product.

## Submission integrity

- Repository: public.
- License: MIT at repository root.
- Sponsor technology: visible in architecture, environment configuration and implementation code.
- Setup/run instructions: root README plus component READMEs.
- Existing-project disclosure: significant hackathon-period updates are explicitly documented above.
- Nemotron tiering: implemented and verified for System Design with server-owned model IDs and runtime model metadata.
- Secrets: server-side environment variables only; populated credentials are not committed.
- Current vs future capabilities: explicitly separated in the architecture documentation.

The public demo video and Devpost submission fields should point judges back to this repository and the live product so the implementation, architecture and sponsor-technology story remain consistent.