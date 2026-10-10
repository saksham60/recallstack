## Summary

Implements the ReasonAI orchestration V3 draft in one branch: permissive current-turn proposal eligibility with deterministic vetoes, strict tool dispatch and bounded graph execution, streamed preambles and task outcomes, 50-operation batches and 150-operation durable proposals, stable revision/item IDs, rehydration and partial-decision reconciliation, a nonpersistent Konva ghost layer, and offline atomic Accept All with one local Undo and idempotent proposal receipts.

The proposal transition route and Supabase migration persist versioned status and item decisions. The API labels acceptance as a client-reported local commit because the canvas document is saved in the browser-side repository. The existing `REASONAI_V2_MODE` flag gates the streaming path and leaves the JSON fallback available.

## Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Focused ReasonAI provider, state, graph, conversation and persistence suite: 273/273 passed (118 provider and 155 other focused tests).
- DSA agent/provider suite: 60/60 passed.
- Browser suite: see final PR update after execution.
- SQL migration execution: not run; local Docker engine and `psql` unavailable.

## Incomplete requirements / safe fallbacks

- Live Accept All and grouped collaborative Undo are disabled because the existing realtime protocol has no atomic batch command and no mixed-version negotiation. Individual live review remains available.
- Standalone Accept All is disabled because its diagram cannot be verified through a repository round trip.
- The server cannot independently verify a browser-local document commit. It records a client-reported receipt and uses local receipt recovery, but cross-device reconciliation still needs an authoritative canvas commit store.
- Ghost boundaries use default palette dimensions; nested grouping and containment sizing are incomplete.
- A full streamed browser flow against real Supabase persistence and migration execution remain unverified. This PR is a draft and is **not production ready**.

See `web/docs/reasonai-orchestration-v3.md` for rollout and rollback instructions.
