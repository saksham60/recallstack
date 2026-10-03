# ReasonAI realtime collaboration service

The `realtime/` service is the low-latency collaboration plane used by the ReasonAI System Design workspace. It is implemented in Go and intentionally has a narrow responsibility: create short-lived collaboration rooms, authenticate access through unguessable room capabilities, serialize committed operations, fan out transient interaction state, maintain participant presence, and help reconnecting clients rebuild the latest shared document.

It does **not** understand ReasonAI canvas semantics. Nodes, edges, child diagrams, drag previews, ink, cursors, and snapshots are opaque JSON to this service. The React/Konva System Design client owns the document model and determines how an operation changes the canvas.

The current deployment is deliberately **single-instance and memory-only**. Room state is not written to PostgreSQL, Supabase, Redis, R2, or any other durable store. A process restart, Render restart, redeploy, sleep, or instance replacement destroys all active rooms. Durable diagram storage is a separate FastAPI/PostgreSQL concern; this service is the live collaboration transport.

---

## Responsibilities

The realtime service owns:

- secure room creation and capability tokens;
- active-room lifecycle and expiry;
- participant admission and a hard room-size bound;
- one serialized mutation loop per room;
- monotonically increasing committed-operation sequence numbers;
- operation acknowledgement;
- bounded `opId` deduplication;
- snapshot checkpoints and replay-window compaction;
- reconnect state selection: full state versus incremental replay;
- transient `op.ephemeral` fanout;
- participant presence and cursor payload fanout;
- transport heartbeat and connection liveness;
- inbound message-size and rate limits;
- bounded outbound queues and slow-client eviction;
- dependency-free Prometheus metrics;
- structured JSON logging;
- graceful room and WebSocket shutdown.

It intentionally does **not** own:

- canvas business logic;
- AI or LangGraph execution;
- ReasonAI tool calling;
- Supabase authentication;
- persistent diagram history;
- cross-instance room routing;
- Redis/pub-sub;
- CRDT or Yjs merge semantics;
- collaborative text editing;
- synchronized undo/redo;
- offline operation queues;
- room access revocation after a room token has been shared;
- long-lived workspace membership.

---

# End-to-end position in ReasonAI

```text
                           REASONAI SYSTEM DESIGN

┌──────────────────────────────────────────────────────────────────────────────┐
│ Browser / Next.js                                                           │
│                                                                              │
│ React workspace                                                             │
│ ├─ Konva canvas                                                             │
│ ├─ committed document state                                                 │
│ ├─ local undo/redo                                                          │
│ ├─ participant UI                                                           │
│ ├─ cursor / drag / resize / ink previews                                    │
│ └─ ReasonAI agent + proposal Apply/Discard                                  │
└─────────────────────────────┬────────────────────────────────────────────────┘
                              │
               HTTP create    │    WebSocket protocol v1
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Go realtime service                                                         │
│                                                                              │
│ HTTP router                                                                 │
│       │                                                                      │
│       ▼                                                                      │
│ Room Manager                                                                │
│       │                                                                      │
│       ├── room A ── serialized command loop ── in-memory state              │
│       ├── room B ── serialized command loop ── in-memory state              │
│       └── room N ── serialized command loop ── in-memory state              │
│                                                                              │
│ Per room:                                                                   │
│ snapshot + snapshotSequence                                                 │
│ committed operation window                                                  │
│ recent opId → sequence dedupe window                                        │
│ participant connections                                                     │
│ presence cache                                                              │
│ nextSequence                                                                │
│ activity / expiry timestamps                                                │
└──────────────────────────────────────────────────────────────────────────────┘

         separate durable ownership
                  │
                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ FastAPI + PostgreSQL                                                        │
│ saved System Design diagrams and optimistic document revisions              │
└──────────────────────────────────────────────────────────────────────────────┘
```

A live room and a persisted diagram are therefore different objects. The realtime service makes concurrent interaction feel live; the backend owns durable saved diagrams.

---

# Core correctness model: one actor-style loop per room

The most important implementation detail is that mutable room state is not protected by a web of independent locks. Each `Room` owns a bounded `commands` channel and runs one goroutine that processes room commands serially.

Conceptually:

```text
join ───────┐
leave ──────┤
message ────┤
metadata ───┼──> room.commands ──> exactly one room event loop
state read ─┤                         │
expiry ─────┘                         ▼
                                 mutate roomState
```

The event loop is the sole owner of:

```text
snapshot
snapshotSequence
clients
presence
operations
recentOpIDs
recentOpOrder
nextSequence
createdAt
lastActivityAt
closed
```

This gives the room a simple ordering invariant:

> if two committed operations are accepted by one room, their sequence numbers are assigned by one serialized state machine.

Admission, deduplication, checkpoint decisions, presence changes, operation sequencing, and expiry decisions all pass through this same mutation path.

The manager itself uses a mutex only to protect the process-wide token → room map. Once a room is found, room behavior is serialized internally by the room command loop.

---

# Process-level architecture

```text
cmd/server/main.go
        │
        ├─ config.Load()
        ├─ slog JSON logger
        ├─ metrics.Registry
        ├─ room.Manager
        ├─ manager cleanup goroutine
        └─ net/http Server
                 │
                 ▼
        internal/httpapi/router.go
                 │
      ┌──────────┼──────────────────────┐
      │          │                      │
   health     room creation        WebSocket join
      │          │                      │
      │          ▼                      ▼
      │     room.Manager        websocket.Handler
      │                               │
      │                               ▼
      │                        websocket.Client
      │                         ├─ read loop
      │                         └─ write loop
      │                               │
      └───────────────────────────────▼
                                   Room
                               serialized loop
```

There is no hidden broker or datastore between these components.

---

# Room creation

## HTTP endpoint

```text
POST /v1/rooms
```

Request:

```json
{
  "snapshot": {
    "id": "diagram-id",
    "nodes": [],
    "edges": []
  }
}
```

The service validates that:

- the request stays under `MAX_HTTP_BODY_BYTES`;
- the body contains exactly one JSON value;
- unknown top-level fields are rejected;
- `snapshot` is present;
- `snapshot` contains valid JSON;
- the process has not reached `MAX_ACTIVE_ROOMS`.

The snapshot itself remains opaque.

## Identifiers

Room creation generates two independent secrets:

```text
room ID    = 16 random bytes → base64url
room token = 32 random bytes → base64url
```

The 32-byte room token carries the guest capability required to find and join the room. It is generated with `crypto/rand`.

The manager indexes rooms by the full token, but application logs use only a short SHA-256-derived token fingerprint. Full room tokens, snapshots, and user operation payloads are not logged.

## Response

A successful request returns HTTP `201`:

```json
{
  "roomId": "...",
  "roomToken": "...",
  "expiresAt": "...",
  "maxParticipants": 10,
  "websocketPath": "/v1/rooms/<token>/ws"
}
```

`expiresAt` reflects the current idle-expiry boundary at creation time. Subsequent accepted collaboration activity can extend idle expiry, but never beyond the room hard lifetime.

---

# Room lifecycle

Every room tracks:

```text
createdAt
lastActivityAt
```

Expiry is:

```text
min(
  lastActivityAt + ROOM_IDLE_TTL,
  createdAt + ROOM_MAX_TTL
)
```

With defaults:

```text
idle TTL = 30 minutes
hard TTL = 4 hours
```

Activity that refreshes `lastActivityAt` includes:

- participant joins;
- participant leaves;
- committed operations;
- ephemeral operations;
- presence updates.

Protocol `ping` / `pong` does not keep a room alive indefinitely.

A single manager-level cleanup ticker scans active rooms every `ROOM_CLEANUP_INTERVAL`. There is deliberately not one timer goroutine per room.

Expiry still enters the room's serialized command loop. When a room closes, active participants are disconnected and the room exits its loop.

---

# Joining a room

Clients connect to:

```text
GET /v1/rooms/{roomToken}/ws?actorId=<actor>&lastSequence=<optional>
```

`actorId` is supplied by the browser and must satisfy the protocol identifier rules:

- non-empty;
- at most 128 bytes;
- no leading or trailing whitespace;
- no control/space characters below `0x21`;
- not DEL.

`lastSequence` is an optional unsigned integer used only to determine reconnect replay behavior.

Before WebSocket upgrade the handler performs useful early checks:

1. room token exists;
2. actor ID is valid;
3. `lastSequence` parses;
4. room metadata is still live;
5. observable participant count is below the room limit.

The final admission decision is still made by the serialized room loop after upgrade, preventing concurrent joins from exceeding `MAX_ROOM_PARTICIPANTS`.

The default maximum is 10 and configuration validation does not allow a value above 10.

---

# Origin boundary

All HTTP and WebSocket browser traffic passes through one exact-origin middleware.

`ALLOWED_ORIGINS` is a comma-separated set of complete HTTP(S) origins, for example:

```text
https://reasonai.tech,https://www.reasonai.tech
```

Wildcards are rejected during startup configuration validation.

When a request carries an `Origin` header and the origin is not explicitly allowed, the server returns `403` before room/WebSocket handling.

This is a browser-origin protection boundary, not user identity authentication. The room token itself remains the room capability.

---

# WebSocket client architecture

Each accepted WebSocket becomes a `Client` with:

```text
random connection ID
actor ID
socket
bounded send channel
close channel
client limits
metrics reference
```

The client then runs two goroutines:

```text
                 Client.Run
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
      readLoop             writeLoop
          │                   │
 receive JSON             socket writes
 validate                 control ping
 rate limit               write timeout
          │                   │
          └─────────┬─────────┘
                    ▼
             cancellation joins
```

If either side exits, the shared context is cancelled and the other loop is joined before `Run` returns.

---

# WebSocket protocol v1

Every application message is a JSON text frame with:

```json
{
  "v": 1,
  "type": "..."
}
```

Binary frames are rejected.

The decoder uses `DisallowUnknownFields()`, so unexpected envelope fields fail closed instead of being silently ignored.

Client message types:

```text
op.commit
op.ephemeral
presence
ping
pong
```

Server message types:

```text
room.state
op.commit
presence
op.ephemeral
ack
error
pong
```

The protocol is transport/domain agnostic: canvas meaning exists only inside `payload` and `snapshot`.

---

# Committed operations

A normal committed message looks like:

```json
{
  "v": 1,
  "type": "op.commit",
  "opId": "alice-42",
  "actorId": "alice",
  "payload": {
    "kind": "node.move",
    "nodeId": "n1",
    "x": 600,
    "y": 300
  }
}
```

For a new `opId`, the room loop:

```text
1. checks replay-window capacity
2. allocates nextSequence
3. increments nextSequence
4. creates immutable committed-operation envelope
5. appends operation to room history
6. optionally applies snapshot checkpoint
7. records opId → sequence in dedupe window
8. broadcasts committed operation
9. ACKs the sender
```

Sequence numbers are room-local and monotonically increasing:

```text
1, 2, 3, ...
```

A committed operation is broadcast to all room clients, including the sender. The sender additionally receives an `ack`.

The service does not execute or validate `payload.kind`; the browser applies domain-level validation and canvas semantics.

---

# Operation acknowledgement

After a successful commit, the sender receives:

```json
{
  "v": 1,
  "type": "ack",
  "opId": "alice-42",
  "actorId": "alice",
  "sequence": 17
}
```

The ACK means the room state machine accepted and sequenced the operation. It does **not** mean the operation has been written to durable storage, because realtime room history is memory-only.

---

# Idempotency and deduplication

Committed operations carry a client-generated `opId`.

The room keeps a bounded map:

```text
opId → original sequence
```

and an insertion-order list used to evict old IDs.

If the same `opId` arrives again while it is still inside the dedupe window:

- no new sequence is allocated;
- the operation is not broadcast again;
- the original sequence is returned;
- the sender receives an ACK with `duplicate: true`.

Example:

```json
{
  "v": 1,
  "type": "ack",
  "opId": "alice-42",
  "sequence": 17,
  "duplicate": true
}
```

The dedupe history is deliberately bounded by `MAX_RECENT_OP_IDS`. It is not an eternal idempotency ledger.

The configuration requires:

```text
MAX_RECENT_OP_IDS >= MAX_ROOM_OPERATIONS
```

so the dedupe window cannot be configured smaller than the active committed replay history.

---

# Snapshot checkpoints and bounded history

Keeping every operation for an entire room lifetime would make memory grow without bound. Instead each room maintains:

```text
latest snapshot checkpoint
snapshotSequence
operations after that checkpoint
```

The room starts with the snapshot supplied at creation.

A client may attach a full current document to a committed operation:

```json
{
  "v": 1,
  "type": "op.commit",
  "opId": "alice-100",
  "actorId": "alice",
  "payload": {"kind":"node.update"},
  "snapshot": {
    "nodes": [],
    "edges": []
  }
}
```

If accepted:

```text
snapshot = supplied snapshot
snapshotSequence = new committed sequence
operations = empty
```

The commit itself is now represented by the checkpoint and does not remain in the post-checkpoint operation array.

When post-checkpoint history reaches `MAX_ROOM_OPERATIONS`, a subsequent committed operation without a snapshot is rejected with:

```text
checkpoint_required
```

No sequence is allocated for that rejected operation.

The client can then resend the operation with a current full snapshot checkpoint.

This creates a bounded-memory state model:

```text
checkpoint + finite ordered tail
```

instead of an unbounded event log.

---

# Reconnect and replay

When a client joins, the first message is always `room.state`.

Its important fields are:

```text
stateMode
currentSequence
historyStartsAt
snapshot
operations
presence
```

## Full state

`stateMode = "full"` includes:

```text
latest snapshot checkpoint
+
all retained committed operations after that checkpoint
```

The client reconstructs the committed document by applying operations in sequence order on top of the supplied snapshot.

## Incremental replay

If the client sends a usable `lastSequence`, the room may send:

```text
stateMode = "replay"
snapshot = omitted
operations = only sequences > lastSequence
```

Replay is valid only when the requested sequence is still reconstructible from the retained history window.

If a client's `lastSequence` predates the latest checkpoint or otherwise falls outside the retained history range, the room falls back to `full` state.

If the client is already at the current sequence, `replay` can contain no operations.

This design makes reconnect correctness explicit:

```text
recent disconnect
      │
      ├─ retained sequence available ──> incremental replay
      │
      └─ history compacted ─────────────> full snapshot + tail
```

There is no server-side durable recovery if the realtime process itself restarts.

---

# Presence

Presence is intentionally separate from the committed operation log.

A client sends:

```json
{
  "v": 1,
  "type": "presence",
  "actorId": "alice",
  "payload": {
    "displayName": "Alice",
    "diagramId": "diagram-1",
    "cursor": {"x": 100, "y": 200}
  }
}
```

The service stores the latest presence payload **for the active connection** and broadcasts the update to other participants.

Presence:

- is not assigned a room sequence;
- is not appended to committed history;
- is not part of snapshot compaction;
- disappears when the connection leaves;
- is included in the initial `room.state` so a reconnecting participant can immediately seed its participant roster.

Join and leave are also broadcast as protocol-level presence lifecycle payloads:

```json
{"status":"joined"}
```

or:

```json
{"status":"left"}
```

The System Design browser owns richer participant presentation such as deterministic colors, fallback names, cursor rendering, and diagram-aware UI.

---

# Ephemeral collaboration state

`op.ephemeral` carries interaction previews that must feel immediate but should never become durable document history.

Examples include:

- node drag previews;
- node resize previews;
- freehand stroke deltas before pointer-up.

Example:

```json
{
  "v": 1,
  "type": "op.ephemeral",
  "actorId": "alice",
  "payload": {
    "kind": "node.drag.preview",
    "nodeId": "n1",
    "x": 550,
    "y": 300
  }
}
```

Ephemeral messages are broadcast to every other participant but not echoed to the sender.

They are:

- unsequenced;
- unacknowledged;
- not retained;
- not replayed;
- not placed in snapshots;
- not part of undo history.

The browser treats them as temporary visual overlays. The final committed operation replaces/clears the corresponding preview.

The frontend also expires abandoned preview sessions if the final event is lost.

---

# Three-state model used by System Design

The collaboration architecture deliberately distinguishes three types of state.

## 1. Committed shared state

Examples:

- node add;
- node move;
- node resize;
- node update;
- node delete;
- batch node updates;
- edge add/update/delete;
- child-diagram creation;
- completed freehand node.

Transport:

```text
op.commit
```

Properties:

```text
server ordered
ACKed
bounded dedupe
replayable
checkpointable
part of shared document
```

## 2. Ephemeral shared state

Examples:

- drag preview;
- resize preview;
- freehand delta;
- participant cursor/presence.

Transport:

```text
op.ephemeral
presence
```

Properties:

```text
best effort
not replayed
not persisted
not sequenced
latest/transient state
```

## 3. Local-only UI state

Examples:

- current selection;
- active canvas tool;
- viewport/zoom;
- inspector tab;
- modal state;
- animation state;
- local undo/redo stack.

Transport:

```text
none
```

This separation prevents high-frequency UI motion from bloating shared operation history.

---

# Last-writer-wins semantics

The realtime service establishes a total order for accepted committed operations but it does not implement a CRDT.

Conflict resolution is therefore effectively:

```text
server-assigned committed order
+
frontend domain reducer
```

For competing writes to the same object, the frontend observes and applies the operations in room sequence order.

Late operations that are no longer meaningful—for example an update targeting a node already deleted by an earlier sequence—must be handled safely by the frontend reducer.

This is suitable for the current structured System Design document model, but it is not equivalent to character-level collaborative text merging.

---

# Child-diagram collaboration

A System Design module can open a nested diagram/page.

The browser derives a deterministic child-diagram ID from the stable module node ID. Therefore two participants creating/opening the same uninitialized module resolve to the same child diagram rather than independently producing parallel nested documents.

Realtime messages still target the relevant diagram/document IDs in their opaque payloads. The Go service never forces all users to navigate to the same child page.

---

# Slow-client isolation

Each WebSocket client has a bounded outbound queue:

```text
MAX_CLIENT_SEND_QUEUE = 128 by default
```

`Participant.Send()` is intentionally non-blocking.

During broadcast:

```text
if queue has capacity:
    enqueue message
else:
    remove client from room
    remove its cached presence
    disconnect with slow-client code
    increment dropped-slow-client metric
```

This prevents one browser with a stalled network or blocked event loop from introducing backpressure into the serialized room state machine.

The tradeoff is deliberate: room health is protected over preserving a connection that cannot keep up.

---

# Inbound rate limiting

Each connection uses a lightweight fixed one-second window.

Default:

```text
MAX_CLIENT_MESSAGES_PER_SECOND = 120
```

If a connection exceeds the bound it is closed with the protocol `rate_limited` error / close code.

The limit applies to application frames received by that connection. It is a local abuse/accident guard, not a distributed quota system.

---

# Message size limits

Two independent limits exist:

```text
MAX_HTTP_BODY_BYTES
MAX_WS_MESSAGE_BYTES
```

Defaults:

```text
HTTP room-create body = 4 MiB
WebSocket message     = 256 KiB
```

The WebSocket read limit is set directly on the underlying connection.

This means a full snapshot supplied inside an `op.commit` must fit within the WebSocket message limit even though the initial room-create HTTP snapshot can be larger.

---

# Actor binding

A connection is created for exactly one `actorId` from the join URL.

Every inbound protocol envelope is decoded with that actor as the expected identity.

If the envelope contains another actor ID, decoding fails with:

```text
actor_mismatch
```

This prevents a joined connection from emitting operations that impersonate another participant inside the same room.

The actor ID is still client-generated; it is not currently bound to a Supabase user identity.

---

# Heartbeats

There are two separate heartbeat concepts.

## WebSocket control heartbeat

The write loop sends a WebSocket control-frame ping every:

```text
WS_PING_INTERVAL = 20s
```

The peer must satisfy the ping within:

```text
WS_PONG_TIMEOUT = 10s
```

Failure closes the connection.

This is the actual transport-liveness mechanism.

## Protocol ping/pong

Application-level messages also support:

```json
{"v":1,"type":"ping","actorId":"alice"}
```

and server `pong`.

These are optional and independent from transport ping/pong. Protocol ping/pong intentionally does not extend room activity TTL.

---

# Write timeout

Each outbound WebSocket write receives its own deadline:

```text
WS_WRITE_TIMEOUT = 10s
```

A blocked socket cannot hold the client writer forever.

---

# Error model

Stable protocol error codes include:

```text
malformed_message
unsupported_protocol_version
unsupported_message_type
actor_mismatch
invalid_operation
room_not_found
room_expired
room_full
server_capacity
rate_limited
slow_client
checkpoint_required
internal_error
```

Important WebSocket close codes include:

```text
4400 malformed message
4401 unsupported version
4403 actor mismatch
4404 room not found
4408 room expired
4409 slow client
4429 rate limited
4430 room full
4500 internal/server shutdown class
```

The service avoids exposing internal stack traces or payload contents in protocol errors.

---

# Security model

The present trust model is intentionally compact.

## Room capability

The room token is the authorization capability for joining a collaboration room.

```text
whoever possesses the token can attempt to join
```

Therefore:

- tokens must not be logged;
- tokens should not be sent to analytics systems;
- share links should be treated as secrets;
- production traffic should use HTTPS/WSS;
- access cannot currently be revoked selectively without destroying the room.

## Origin allowlist

Browser origins must match the exact configured allowlist.

## Actor isolation

A WebSocket cannot send protocol envelopes under a different actor ID than the actor it joined as.

## Input validation

The service uses:

- strict JSON envelopes;
- protocol version checks;
- bounded identifier lengths;
- bounded HTTP bodies;
- bounded WebSocket frames;
- bounded message rate;
- bounded active rooms;
- bounded participants;
- bounded history;
- bounded dedupe memory;
- bounded output queues;
- bounded socket writes.

## Logging

Logs use room-token fingerprints rather than raw room tokens and do not intentionally log snapshots or operation payloads.

---

# Memory bounds

The service is intentionally designed so a single process has explicit upper bounds instead of open-ended growth.

| Resource | Bound |
| --- | --- |
| active rooms | `MAX_ACTIVE_ROOMS` |
| participants / room | `MAX_ROOM_PARTICIPANTS` ≤ 10 |
| HTTP room snapshot | `MAX_HTTP_BODY_BYTES` |
| inbound WS frame | `MAX_WS_MESSAGE_BYTES` |
| operations after checkpoint | `MAX_ROOM_OPERATIONS` |
| dedupe IDs / room | `MAX_RECENT_OP_IDS` |
| queued outbound frames / client | `MAX_CLIENT_SEND_QUEUE` |
| messages / second / client | `MAX_CLIENT_MESSAGES_PER_SECOND` |
| room idle lifetime | `ROOM_IDLE_TTL` |
| room hard lifetime | `ROOM_MAX_TTL` |

The room command channel is also bounded (`256` commands in the current implementation).

These limits are especially important because the service has no external persistence layer that can absorb unbounded state.

---

# Process-wide room manager

`room.Manager` owns:

```text
map[roomToken]*Room
```

Responsibilities:

- generate IDs/tokens;
- enforce `MAX_ACTIVE_ROOMS`;
- find rooms by capability token;
- run periodic expiry scans;
- remove expired rooms;
- close every active room during process shutdown.

Room token collision is handled by generating another room token. The random space is sufficiently large that this should be extraordinarily rare.

---

# Observability

## Structured logs

The server uses Go `slog` with a JSON handler.

Useful lifecycle events include:

```text
realtime server starting
room created
participant joined
committed operation (DEBUG)
participant left
room expired
websocket disconnected
shutdown requested
realtime server stopped
```

Sensitive collaboration payloads are intentionally excluded from normal logs.

## Prometheus endpoint

```text
GET /metrics
```

The implementation exports dependency-free Prometheus text metrics:

```text
recallstack_realtime_active_rooms
recallstack_realtime_active_connections
recallstack_realtime_rooms_created_total
recallstack_realtime_rooms_expired_total
recallstack_realtime_messages_received_total
recallstack_realtime_messages_broadcast_total
recallstack_realtime_committed_operations_total
recallstack_realtime_ephemeral_operations_total
recallstack_realtime_reconnects_total
recallstack_realtime_dropped_slow_clients_total
```

Metrics are process-local and reset when the instance restarts.

---

# Health endpoints

```text
GET /healthz
GET /readyz
```

Both currently return:

```json
{"status":"ok"}
```

`readyz` is therefore a process-readiness signal, not an external datastore dependency check because the realtime process intentionally has no datastore dependency.

---

# Graceful shutdown

The process listens for:

```text
SIGINT
SIGTERM
```

Shutdown sequence:

```text
signal received
      │
      ├─ stop room cleanup goroutine
      │
      ├─ begin HTTP server shutdown
      │
      ├─ close all rooms
      │     └─ disconnect active clients
      │
      └─ complete within SHUTDOWN_TIMEOUT
```

Default shutdown timeout:

```text
10 seconds
```

Because room state is not durable, graceful shutdown improves client behavior but does not preserve rooms across process replacement.

---

# Configuration

Configuration comes directly from environment variables. The binary does not load `.env` itself.

| Variable | Default | Purpose |
| --- | ---: | --- |
| `PORT` | `8080` | HTTP listen port |
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `ALLOWED_ORIGINS` | localhost origins | exact HTTP(S) browser origins; wildcard forbidden |
| `MAX_ROOM_PARTICIPANTS` | `10` | room admission cap, max allowed value is 10 |
| `MAX_ACTIVE_ROOMS` | `1000` | process room cap |
| `ROOM_IDLE_TTL` | `30m` | expiry from last meaningful room activity |
| `ROOM_MAX_TTL` | `4h` | hard lifetime from creation |
| `ROOM_CLEANUP_INTERVAL` | `30s` | manager expiry scan |
| `MAX_HTTP_BODY_BYTES` | `4194304` | room creation body bound |
| `MAX_WS_MESSAGE_BYTES` | `262144` | WebSocket input frame bound |
| `MAX_ROOM_OPERATIONS` | `2000` | max committed tail after checkpoint |
| `MAX_RECENT_OP_IDS` | `4000` | bounded commit dedupe window |
| `MAX_CLIENT_SEND_QUEUE` | `128` | queued outbound frames / client |
| `MAX_CLIENT_MESSAGES_PER_SECOND` | `120` | fixed-window inbound limit |
| `WS_PING_INTERVAL` | `20s` | control-frame heartbeat cadence |
| `WS_PONG_TIMEOUT` | `10s` | transport heartbeat deadline |
| `WS_WRITE_TIMEOUT` | `10s` | individual write deadline |
| `SHUTDOWN_TIMEOUT` | `10s` | graceful termination bound |

Durations use Go syntax such as:

```text
30s
15m
4h
```

Configuration is validated before the server starts. Invalid bounds fail startup rather than creating a partially unsafe runtime.

---

# Local development

Go 1.27+ is required by the current build image/module.

```bash
cd realtime
cp .env.example .env
```

Export the required variables in your shell, then:

```bash
go run ./cmd/server
```

Default local address:

```text
http://localhost:8080
```

---

# Repository structure

```text
realtime/
├── cmd/server/main.go
│   └── process startup, HTTP server, cleanup and graceful shutdown
│
├── internal/config/
│   └── environment parsing and validation
│
├── internal/httpapi/
│   ├── router.go
│   ├── rooms.go
│   └── health.go
│
├── internal/websocket/
│   ├── handler.go
│   └── client.go
│
├── internal/protocol/
│   ├── message.go
│   └── errors.go
│
├── internal/room/
│   ├── manager.go
│   ├── room.go
│   └── operation.go
│
└── internal/metrics/
    └── metrics.go
```

The dependency direction is intentionally simple:

```text
HTTP / WebSocket adapters
          ↓
       protocol
          ↓
         room
          ↓
   process-local memory
```

There is no persistence adapter in the realtime service today.

---

# Testing strategy

Recommended verification:

```bash
cd realtime
gofmt -w .
go vet ./...
go test ./...
go test -race ./...
go build ./cmd/server
docker build -t reasonai-realtime .
```

The current test suite covers behavior such as:

- configuration validation;
- protocol validation;
- token uniqueness;
- room lifecycle and TTL;
- participant limits;
- concurrent committed ordering;
- operation deduplication;
- checkpoint compaction;
- replay and full-state fallback;
- ephemeral fanout;
- presence behavior;
- slow-client removal;
- two-client WebSocket integration;
- invalid/oversized messages.

`go test -race ./...` is particularly important because correctness depends on the intended separation between manager locking, room command serialization, and per-client goroutines.

---

# Container

The Docker build uses two stages:

```text
Go 1.27 builder
      ↓
CGO_ENABLED=0 static amd64 binary
      ↓
distroless static Debian 12 nonroot runtime
```

The runtime:

- runs as `nonroot`;
- exposes `8080`;
- has no shell/package manager requirement;
- starts only the realtime binary.

Build locally:

```bash
docker build -t reasonai-realtime .
```

---

# Render deployment

The current architecture requires exactly **one realtime instance**.

Recommended Render setup:

1. Create a Web Service from this repository.
2. Use Docker.
3. Root directory: `realtime`.
4. Dockerfile: `./Dockerfile`.
5. Health check: `/healthz`.
6. Set `ALLOWED_ORIGINS` to the exact ReasonAI production origin(s).
7. Keep `MAX_ROOM_PARTICIPANTS=10` unless deliberately lowering it.
8. Deploy one instance.
9. Disable horizontal autoscaling.

Why one instance matters:

```text
instance A                    instance B
room map A                    room map B
   │                              │
 token X exists here          token X absent here
```

Without shared room storage/pub-sub/sticky routing, different instances do not know about each other's rooms.

Horizontal autoscaling would therefore break room lookup and collaboration correctness.

---

# Manual smoke test

Create a room:

```powershell
$base = "https://YOUR-SERVICE.onrender.com"
$origin = "https://reasonai.tech"
$created = Invoke-RestMethod `
  -Method Post `
  -Uri "$base/v1/rooms" `
  -Headers @{ Origin = $origin } `
  -ContentType "application/json" `
  -Body '{"snapshot":{"nodes":[],"edges":[]}}'

$created
```

Open two WebSocket clients:

```bash
websocat -H='Origin: https://reasonai.tech' \
  'wss://YOUR-SERVICE.onrender.com/v1/rooms/ROOM_TOKEN/ws?actorId=alice'

websocat -H='Origin: https://reasonai.tech' \
  'wss://YOUR-SERVICE.onrender.com/v1/rooms/ROOM_TOKEN/ws?actorId=bob'
```

Each first receives `room.state`.

Send from Alice:

```json
{
  "v": 1,
  "type": "op.commit",
  "opId": "alice-1",
  "actorId": "alice",
  "payload": {
    "kind": "smoke.test",
    "value": 1
  }
}
```

Expected:

```text
Alice: op.commit(sequence=1) + ack(sequence=1)
Bob:   op.commit(sequence=1)
```

Then send another commit from Bob and verify Alice receives sequence 2.

Reconnect Bob with:

```text
lastSequence=1
```

and verify the initial state is an incremental replay containing the missing committed operation.

---

# Current guarantees versus non-guarantees

| Concern | Current guarantee |
| --- | --- |
| committed operation ordering | yes, one serialized room loop |
| sequence uniqueness in a live room | yes |
| bounded duplicate suppression | yes, by recent `opId` window |
| sender ACK | yes for accepted commits |
| reconnect replay | yes while history remains reconstructible |
| checkpoint/full-state fallback | yes |
| participant presence | yes, connection lifetime only |
| drag/resize/freehand transient fanout | yes |
| slow-client isolation | yes |
| transport heartbeat | yes |
| room persistence after process restart | **no** |
| cross-instance room synchronization | **no** |
| global user authentication | **no; room capability only** |
| selective invite revocation | **no** |
| CRDT merge semantics | **no** |
| synchronized undo/redo | **no** |
| offline edit queue | **no** |

---

# Relationship to ReasonAI memory

Realtime room state is **not ReasonAI learner memory** and should not be described as such.

ReasonAI contains several different state systems:

```text
DSA durable conversation memory     → Next.js / PostgreSQL
learner cross-conversation memory   → Next.js / PostgreSQL
feed behavior/preferences           → FastAPI / PostgreSQL
saved diagram document              → FastAPI / PostgreSQL
live collaboration room             → Go process memory only
mobile local drafts/cache           → device SQLite
```

The realtime service remembers enough live room state to support collaboration and reconnect **while that process/room exists**. It does not learn from users, retrain models, or create long-term user memory.

---

# Scaling path — not implemented today

The current single-instance design is appropriate while collaboration scale is small and keeps the correctness model easy to reason about.

A future multi-instance architecture would require an explicit room-ownership and durability design rather than simply enabling autoscaling.

A possible evolution is:

```text
WebSocket clients
      │
      ▼
load balancer
      │
      ▼
room ownership / routing
      │
      ├──────────────┐
      ▼              ▼
realtime A       realtime B
      │              │
      └──────┬───────┘
             ▼
 shared coordination / pub-sub
             │
             ▼
 durable room checkpoint store
```

That future version would need decisions for:

- sticky versus explicit room routing;
- ownership leases;
- distributed sequence allocation or single room leader;
- durable snapshots;
- operation log retention;
- cross-instance pub/sub;
- failure takeover;
- room-token revocation;
- connection migration;
- metrics aggregation.

Redis, PostgreSQL, NATS, Kafka, or another technology should only be selected after those semantics are defined. The current README intentionally does not claim any of this exists.

---

# Engineering invariants

When modifying this service, preserve these invariants unless a deliberate architecture change replaces them:

1. **A room has one mutation authority.** Do not mutate `roomState` from socket goroutines.
2. **Committed sequences are allocated only after acceptance.** Rejected operations must not consume a sequence.
3. **Duplicate `opId`s do not create another commit.**
4. **Presence and ephemeral traffic never enter committed replay history.**
5. **Memory is bounded.** Any new retained collection requires an explicit upper bound or lifecycle.
6. **Slow clients cannot block the room loop.**
7. **Room tokens are secrets.** Never log raw capability tokens.
8. **Canvas payloads stay opaque.** Domain semantics belong to the System Design client/backend, not this transport service.
9. **Reconnect always starts with `room.state`.**
10. **Single-instance deployment remains mandatory until cross-instance coordination actually exists.**
11. **Do not call ACK durable persistence.** It confirms room acceptance only.
12. **Do not describe room state as learner memory or self-learning.**

These boundaries are what keep the realtime service small, deterministic, and operationally understandable.