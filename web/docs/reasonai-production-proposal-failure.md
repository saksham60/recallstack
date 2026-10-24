# System Design proposal failure follow-up

Production run: `f3e2e650-4b77-43f0-8f80-ccbbe93fa5a5`, October 24, 2026,
11:49:32–11:50:01 UTC. Investigation used read-only Supabase transcript queries
and Vercel runtime logs. No production data or deployment configuration changed.

## Evidence and limits

- The request began with a review, preserved existing components, and explicitly
  asked for proposed missing components and connections in a later clause.
- Two analysis tools completed. `propose_canvas_changes` then failed with
  `WRONG_PROPOSAL_CONTRACT`. The next model call returned prose, ending with an
  offer to prepare the already-requested proposal.
- The persisted response and generation log reported task outcome `completed`;
  the completed-run log reported `proposalCount: 0`. The sources notice repeated
  the same validation warning twice.
- Raw submitted tool arguments were not retained in the available transcript
  or metadata-only logs. That diagnostic can mean unsupported top-level fields
  or an invalid operations container. It does **not** identify the submitted
  payload or establish why Nemotron selected that shape. The user's
  `recallstack/system-design-fragment` is clipboard data, not evidence of a tool
  submission. The regression payloads are explicitly synthetic.

## Changes

- Detect imperative edit requests in later clauses while preserving current
  no-change vetoes and explanation-only behavior. Finalization independently
  rejects successful proposal outcomes without a validated proposal. Necessary
  initial questions retain the separate `needs_clarification` outcome.
- Keep the exact validator diagnostic in transient graph state and the tool
  response. The next primary-model call is restricted to the existing proposal
  tool and its unchanged schema. The prompt asks to correct the rejected batch,
  preserve validated batches, and translate input formats into flat operations.
  Prose, permission questions, or other tools cannot satisfy that correction.
- Default correction remains one attempt, within the existing shared model,
  tool and wall-clock budgets. Repeated invalid output stops model calls and
  recovers the last working checkpoint, or fails truthfully when none exists.
- Once an initial tool step finishes on an explicit proposal request, offer only
  the proposal tool until a proposal exists, avoiding further analysis detours.
- Keep tool notices as distinct transient messages. The provider no longer
  copies them into its response; finalization composes and deduplicates messages
  once. The validation notice describes the rejected attempt accurately even
  when correction subsequently succeeds.
- Log only allowlisted top-level property names and summary/operations types
  alongside the validator code. Unknown property names and all values remain
  omitted. Future contract failures can be distinguished without retaining raw
  model arguments or clipboard data.

Idempotency, checkpoint identities, durable persistence, architecture review,
delta repair, approval decisions and canvas concurrency checks retain their
existing implementations. No schema or migration changes are included.

## Regression coverage — not run

`e2e/system-design-reasonai-production-proposal.spec.ts` covers wrong wrappers,
extra fields, non-array operations, reference diagnostics, SSE and JSON provider
correction, single warning output, bounded exhaustion, recovery, mixed intent,
no-change precedence, zero-proposal failure, necessary clarification and safe
diagnostic logging. The existing draw-retry transport expectation now checks
the forced proposal tool. The old optional-invalid-proposal prose-success case
is replaced by the stricter targeted cases.

Tests, type checks, builds, migrations and deployment commands were not run,
per the user's testing boundary. Only source review and `git diff --check`
were performed. This change has not been verified against a live model.
