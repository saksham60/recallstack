# ReasonAI provider proposal investigation

## Outcome

The provider now runs the same deterministic sanitizer as the browser before strict proposal validation. Recoverable representation errors can reach the browser as valid suggestions. A full-canvas response is still intentionally rejected with `WRONG_PROPOSAL_CONTRACT`; no operations are inferred from it.

No current prompt/schema drift, alternative canvas generator or provider fallback using a full-canvas schema was found. The previously observed `title / requirements / scaleAssumptions / nodes / edges` closely matches the **input context**. An accidental context echo by the model is plausible, but the historical response's origin cannot be proved without its request/tool envelope. This patch fixes the recoverable pre-browser rejection and makes wrong-contract failures identifiable; it cannot guarantee model compliance.

## Exact request and rejection path

1. `reasonai/ReasonAIPanel.tsx`, `send`: `buildReasonAIContext` creates the active-diagram input and `fetchReasonAI` posts to `/api/reasonai/chat`. The shared authenticated-request helper retries authentication for the same endpoint; it does not switch providers or schemas.
2. `src/app/api/reasonai/chat/route.ts`, `POST`: authenticates, validates the request using `parseReasonAIRequest`, then calls `reasonAIProvider.complete`. The route is unchanged.
3. `reasonai/provider.ts`, `reasonAIProvider.complete`: reads `getReasonAIConfiguration`, posts to the configured OpenAI-compatible `/chat/completions`, then calls `readBoundedJSON(response, 128 * 1024)` and `selectChoice`. Configuration defaults to Nebius Token Factory and `nvidia/nemotron-3-super-120b-a12b`; environment overrides select one URL/model. There is no model/provider fallback.
4. `complete` handles `search_web` as an intermediate tool. Non-search responses go to `normalizeResponse`.
5. `normalizeResponse` validates the tool name/type and checks for configured secrets. It parses `function.arguments` with `JSON.parse`. Malformed proposal JSON raises `TOOL_ARGUMENT_JSON_INVALID`.
6. Only `propose_canvas_changes`, with `allowsReasonAIProposal(request)`, enters the proposal branch. That branch now calls `sanitizeAIProposal(value, request.context)`, then **the original strict** `parseReasonAIProposal(normalized.proposal, request.context)`.
7. On failure, the development diagnostic records the stage/code, and the existing `reject` path logs `PROPOSAL_VALIDATION_FAILED` and throws `ReasonAIProviderError` with status 502. The route returns the existing `{ error }` response. The browser continues mapping the legacy proposal error to its friendly canvas-update message. Truncated malformed arguments retain the existing incomplete-response message.
8. On success, the existing visible-text/citation processing completes and the browser defensively normalizes and validates the proposal again. Existing card acceptance, factories, reducer preflight, undo and collaboration are unchanged.

Paths starting with `reasonai/` are under `src/features/system-design/`.

## Contract and drift audit

The one proposal schema is `REASONAI_TOOL.function.parameters` in `reasonai/contract.ts`:

```text
type: object; additionalProperties: false
required: summary, operations
summary: string, maxLength 2000
operations: array, 1–50 entries, oneOf operationSchemas
```

`operationSchemas` defines `add_node`, `update_node`, `move_node`, `delete_node`, `add_edge`, `update_edge`, `delete_edge`. The same definitions drive strict operation-field validation. Node/edge enum values derive from the existing palette/edge registries. There is no duplicate full-document proposal schema or legacy adapter.

`SYSTEM_DESIGN_REASONAI_PROMPT` in `reasonai/system-prompt.ts` says to use `propose_canvas_changes` for architecture modifications and to use its supported types and reference conventions. The exact `{ summary, operations }` wrapper is specified by the tool schema rather than repeated literally in the prose prompt. `reasonAITurnRules` adds mode, authorization, research counts and date; it introduces no alternative output contract. Prompt and schema were left unchanged because there was no unambiguous mismatch.

Every initial/research-follow-up proposal uses this same tool definition. The final bounded synthesis disables tools; overlay repair permits only `show_architecture_analysis` and returns the previous safe analysis if the model attempts a proposal. Neither path switches to a different proposal schema.

Searches covered the current `web/src`, backend/mobile source trees and web documentation, including the archived prompt review. No older/direct architecture generation feature or fallback wiring was found in current source. This is a current-checkout audit, not proof about a previously deployed version or external model configuration.

## The full-canvas response

| Candidate source | Finding |
| --- | --- |
| `buildReasonAIContext` | Produces `title`, `requirements`, `scaleAssumptions`, `selectedNodeIds`, `selectedEdgeIds`, `nodes`, `edges`. This is input under `CANVAS_CONTEXT`, not output. It most closely resembles the observed shape. |
| `show_architecture_analysis` | Valid separate output contains `type`, `title`, `summary`, `assumptions`, `nodes`, `edges`. These are annotations referencing existing IDs, not canvas nodes/edges. Dispatch by tool name sends it to `parseReasonAIVisualization`, never the proposal parser. |
| Saved/imported canvases | Versioned document/diagram contracts; no full-document-to-proposal adapter. These paths do not call the model or route imports through `parseReasonAIProposal`. |
| DSA ReasonAI | Separate `/api/reasonai/dsa/chat` endpoint, provider prompt and `present_visual_lesson` schema. It shares configuration and bounded body reading, not proposal dispatch. |
| Provider fallback | None. Overlay correction uses the same model and visualization schema. |

A nonconforming model can place the full-canvas shape in `propose_canvas_changes` arguments, where it reaches the proposal branch and is correctly rejected. JSON returned in ordinary assistant text is not interpreted as a proposal. No application-side cross-routing or prompt/tool mismatch was found. Tool choice is automatic; the application does not receive a guarantee that model arguments match the declared schema.

## Shared normalization and import boundary

The pure `sanitizeAIProposal` function is in the existing `reasonai/sanitizeAIProposal.ts`. It imports only pure palette/edge/layout constants, contract helpers and erased TypeScript types. It does not import React, DOM, Konva, browser stores, node factories, reducers, secrets or provider configuration.

The previous import from `system-design-defaults.ts` pulled in technology/visual registries and random ID generation. It was removed. `SYSTEM_DESIGN_PASTE_OFFSET` now lives in a small shared constants file and is re-exported from its original location, preserving all existing callers and its value of 32.

Missing/invalid **temporary proposal refs** now use collision-checked deterministic `new:repaired_<index>` references. These are not persisted canvas IDs. Factories still generate real IDs only on acceptance. Identical raw inputs normalize identically on server and browser, and normalizing an already normalized proposal is idempotent.

The provider calls the pure sanitizer directly and then strict validation. It deliberately does not call the browser's logging wrapper, which retains its separate development diagnostics. Strict validation rules were not loosened; only structured error metadata was added.

## Recovery and fatal cases

The provider now shares the previously tested browser repairs:

- Known edge aliases become canonical supported types; unknown relationships become the existing `custom` type.
- Null optional strings, missing harmless labels/summary and invalid finite-range coordinates receive existing safe defaults.
- Temporary references are repaired/remapped without persisting model-controlled IDs. Duplicate node declarations keep their first occurrence.
- Duplicate connections are filtered against proposal/current context using the existing conservative reducer-compatible rule; dangling/self connections and unsupported AI node additions are discarded.
- Supported boundaries use existing factory dimensions at acceptance; no boundary rendering or container logic runs on the server.

Intentionally fatal: malformed JSON; nonobject/wrong top-level contract; missing/nonarray/oversized operations; no usable operations; unknown operations; unsupported fields; invalid/oversized text or required identifiers; stale update/delete targets; and any other remaining strict-contract/reference failure. The existing authorization, secret-echo, response-size and tool-dispatch checks still apply. A `{ nodes, edges }` document is never converted to operations.

## Diagnostics and privacy

Previously the provider logged category/counts and a fixed validator message, never raw rejected arguments. Existing code comments and tests explicitly forbid logging response contents, caught JSON/fetch error messages, credentials and private user text.

Development-only `PROPOSAL_DIAGNOSTIC` now includes provider identity, redacted configured model name, parse stage, structured error code, original zero-based operation index when available, a recognized field name, recognized top-level keys and argument length. Unknown keys are replaced by `[unknown]` because property names may also contain sensitive text. `PROPOSAL_NORMALIZED` contains only repair codes/indexes.

Raw tool arguments remain omitted, including in development, to honor that existing policy. The diagnostic explicitly states `[omitted by provider logging policy]`. Malformed JSON cannot be reliably redacted, and even valid JSON may contain private architecture labels or arbitrary credentials. Production retains only the existing safe diagnostics and user-facing behavior. No new environment flags or logging sinks were added.

## Follow-up files changed

- `src/features/system-design/reasonai/provider.ts`: normalization before validation and safe development diagnostics.
- `src/features/system-design/reasonai/contract.ts`: diagnostic codes, field names and operation indexes; validation remains strict.
- `src/features/system-design/reasonai/sanitizeAIProposal.ts`: deterministic, dependency-safe normalization; explicit wrong-contract rejection and original-index mapping.
- `src/features/system-design/constants/system-design-layout.ts`: shared spacing constant.
- `src/features/system-design/utils/system-design-defaults.ts`: backward-compatible re-export of that constant.
- `e2e/reasonai-provider.spec.ts`: nine new recovery/privacy/diagnostic cases, including browser compatibility and deterministic collision handling.
- `docs/reasonai-proposal-recovery.md`: update earlier browser-only report.
- `docs/reasonai-provider-investigation.md`: this report.

The earlier browser/UI changes remain in the working tree. No backend service, database, route contract, prompt, canvas model or acceptance behavior was redesigned.

## Verification

- `npm run test:system-design-state -- reasonai-provider.spec.ts reasonai-state.spec.ts`: **145 passed**, including matching DSA provider regressions and all nine new provider cases.
- `npm run typecheck`: passed.
- Targeted ESLint for the six changed implementation/test TypeScript files: passed.
- `npm run build` (production `next build`): passed with no server/client import-boundary errors.
- Existing ReasonAI Chromium suite: **17 passed**. The auto-started server initially returned a 404 for the canvas in setup; that run was stopped. All tests passed against a separately started server with explicit test feature/auth flags. No product or test assertions were changed to bypass the failure.
- `git diff --check`: passed.

Tests use mocked model responses; no claim is made about reproducing the historical failure against the live model.
