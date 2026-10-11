# COLLAB-01 — two-session live canvas synchronization

| Field | Observed value |
| --- | --- |
| UTC timestamp | Complete attempt: 2026-10-11 08:25:19–08:25:30 UTC |
| Git SHA / deployment | `9641835b13d10bdad508c895718481146cbf57de`; production deployment SHA unverified |
| Operator/evaluator | Codex |
| Environment and client | Production Live Share, two independently authenticated, isolated Chromium contexts at 1600×1000 |
| Execution type | Live product collaboration; no inference call |
| Provider / model ID | Not applicable |
| Auth mode / seeded data | Both contexts used judge mode. A imported the test-only 3-node, 2-edge messaging seed. The private room URL was used in memory and never stored. |
| Starting state | Both clients displayed three nodes and two connections after B joined |
| Prompt / expected | A adds a node and connection; B receives them, moves the node; A receives the move; B reloads and recovers the converged canvas |
| Tool calls | Not applicable; no protocol operation IDs or ACK frames were captured |
| Validation and user action | A added a Note and connected it to Chat service. B moved the Note. Both canvases showed four nodes and three connections. B reload retained that state. The moved position is visible in both screenshot sets. |
| Actual response and outcome | Full requested UI sequence observed on attempt 3. Session B displayed the new node and edge, A displayed B’s moved node, and B recovered after reload. |
| Wall-clock duration | 10.9 s for the complete scripted browser sequence, including authentication, import, share, edits, screenshots, and reload; not a network latency metric |
| Rubric | Functional 2, grounding not applicable, tool/contract 1 (ACKs not captured), utility 2, safety/failure handling 2 = **7/8** |
| Verdict | **Pass for observed UI convergence and reconnect**. Protocol ACK/operation IDs and backend topology were not independently inspected. |
| Known limitations / retries | Attempt 1 showed node sync and reconnect but did not test a new connection or move. Attempt 2 moved B’s node but missed A’s connection port, leaving two edges. Attempt 3 used the actual visible port coordinates and completed all UI steps. Repository Go service is documented as single-instance/in-memory; this run does not establish production instance count or capacity. |
| Redaction review | Codex, 2026-10-11 UTC; screenshots contain only test diagram and generated guest labels. Private share URL, QR code, auth data, and WebSocket traffic were not exported. |
| Artifacts | [Full attempt](observed.json), [attempt 1](observed-attempt-1.json), [attempt 2](observed-attempt-2.json), [A before](../../../screenshots/2026-10-11/collab-before-a.png), [B before](../../../screenshots/2026-10-11/collab-before-b.png), [A after edit](../../../screenshots/2026-10-11/collab-edit-a.png), [B synchronized](../../../screenshots/2026-10-11/collab-sync-b.png), [B move](../../../screenshots/2026-10-11/collab-move-b.png), [A synchronized move](../../../screenshots/2026-10-11/collab-move-synced-a.png), [B reconnect](../../../screenshots/2026-10-11/collab-reconnect-b.png), [earlier node-only sync](../../../screenshots/2026-10-11/collab-attempt-1-sync-b.png), [earlier missed connection](../../../screenshots/2026-10-11/collab-attempt-2-edit-a.png) |

## Reproduction

Run `node scripts/capture-collab-evidence.mjs` from `web/`. The script creates two isolated browser contexts, signs both in through judge mode, imports the seed through A’s UI, creates a live room, joins through B without saving the private link, performs the edits, and checks the node/connection counts before and after B reloads. Port and drag coordinates are tied to the recorded 1600×1000 viewport.
