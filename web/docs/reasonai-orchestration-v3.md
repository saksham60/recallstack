# ReasonAI orchestration V3 implementation notes

This branch is a **draft implementation**. It must not be described as production ready until the blockers below are resolved and the migration and browser flows are verified against a real Supabase database.

## Runtime and proposal contract

- The current message decides whether a proposal tool is offered. Explicit whole-canvas no-change requests veto it. Chat, Review, Fix, and Eagle View affect response style, not authorization.
- The graph accepts only tools offered in that round, rejects unrecognized calls, deduplicates equivalent calls, and has bounded model/tool rounds. A valid proposal is a pending suggestion; it is never a canvas mutation.
- Each model call may submit at most 50 operations. The pending proposal may accumulate at most 150 operations. Revision IDs and operation IDs remain stable while later batches extend the pending proposal. The durable state stores the proposal, status, version, item decisions, reference mappings, base fingerprint, and last reported fingerprint.
- Text preambles stream before tools. The final runtime event includes a task outcome; `awaiting_approval` is distinct from `completed` and from an applied change. Traces use bounded error codes and metadata.
- Layout is deterministic and checks node placement. Ghost nodes, edges, and moves render in a separate Konva layer and do not enter document state.

## Acceptance and persistence

- Offline Accept All validates the active diagram, fingerprint, all operations, and trusted canvas operation factories before a single `replaceDocument` dispatch. That dispatch produces one editor history entry and one Undo. The saved document is read back before a client-reported proposal transition is sent.
- A receipt is stored locally before the save and retried after reload if the saved diagram fingerprint matches. The transition RPC uses owner scope, row locking, proposal and state versions, idempotent event IDs, and item IDs. Partial acceptance records `new:` to real node mappings so remaining operations can be rebased.
- Discard persists proposal status and clears the preview without changing the canvas.
- **Live Accept All is disabled.** Existing collaboration protocol has no atomic batch command or grouped collaborative undo, so compatible live clients cannot yet be guaranteed to see one all-or-nothing transaction. Individual live review remains available. This is an incomplete requirement.
- **Standalone Accept All is disabled** because its document has no verified persisted repository round trip. Individual review remains available.
- The server records a `client_reported_local_commit` acknowledgement. It cannot independently verify a browser-only/local document save. This is an incomplete persistence assurance for cross-device recovery.
- Ghost boundaries currently use palette default dimensions. Nested grouping, automatic containment sizing, and full boundary geometry are incomplete.

## Rollout and rollback

1. Apply `20261010110129_reasonai_orchestration_v3_proposal_state.sql` to a staging Supabase project and verify the function, RLS, grants, and owner-scoped transition RPC with two real users. No remote migration is performed by this branch.
2. Set `REASONAI_V2_MODE=system_design` in staging to enable the streaming graph. `all` also enables the existing DSA stream. The existing JSON path remains available when System Design streaming is disabled.
3. Verify draft proposal, revision, reload, individual acceptance, lost-ack retry, discard, and offline Accept All/Undo in a browser against staging persistence. Verify DSA, Feed, and realtime regressions.
4. Roll back the application behavior by removing `system_design` from `REASONAI_V2_MODE`. Leave the additive database objects in place until a separate, reviewed cleanup migration is prepared; rolling back an active proposal schema could discard user state.

## Verification gaps

- Local Docker and `psql` are unavailable, so the SQL migration has not executed against a database.
- No browser end-to-end test yet proves the complete streamed preview, persistence acknowledgement, and offline Accept All flow.
- Mixed-version collaboration synchronization and safe grouped live undo require a protocol change and are not implemented.
