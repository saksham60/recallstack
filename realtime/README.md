# Recall Stack realtime service

This module is the temporary, single-process collaboration service for Recall Stack. It owns rooms, connected participants, ordering, bounded replay, deduplication, generic presence, and generic ephemeral fanout. Canvas documents and operation payloads remain opaque JSON; React/Konva owns all canvas semantics.

## Non-goals

This phase intentionally has no persistence, Redis, database, Supabase, AI, MCP, CRDT, Yjs, message broker, canvas model, or cross-instance synchronization. The room token is the guest capability and must be kept secret.

## Architecture

```text
Browser clients
      |
      | HTTP + WebSocket protocol v1
      v
Go HTTP server
      |
Room manager + one serialized event loop per active room
      |
In-memory snapshot, operation window, dedupe set, and presence
```

The room event loop is the sole owner of mutable room state. Every client has one bounded outbound queue and one socket writer. A slow client is disconnected without blocking its room. A manager-level ticker expires rooms, avoiding one cleanup ticker per room.

## Local run

Go 1.27 or newer is required.

```bash
cd realtime
cp .env.example .env
# Export the values from .env using your shell, then:
go run ./cmd/server
```

The server listens on `http://localhost:8080` by default. Configuration is read directly from environment variables; `.env` files are not loaded by the binary.

## Configuration

| Variable | Default | Purpose |
| --- | ---: | --- |
| `PORT` | `8080` | HTTP listen port; Render supplies this automatically. |
| `LOG_LEVEL` | `INFO` | Structured JSON log level (`DEBUG`, `INFO`, `WARN`, `ERROR`). |
| `ALLOWED_ORIGINS` | localhost origins | Comma-separated exact HTTP(S) origins. Wildcards are rejected. |
| `MAX_ROOM_PARTICIPANTS` | `10` | Serialized room admission cap; may not exceed 10. |
| `MAX_ACTIVE_ROOMS` | `1000` | Process-wide cap preventing unbounded empty-room creation. |
| `ROOM_IDLE_TTL` | `30m` | Expiry since last join, leave, committed, presence, or ephemeral activity. |
| `ROOM_MAX_TTL` | `4h` | Hard lifetime from room creation. |
| `ROOM_CLEANUP_INTERVAL` | `30s` | Manager cleanup scan interval. |
| `MAX_HTTP_BODY_BYTES` | `4194304` | Maximum create-room request/snapshot envelope size. |
| `MAX_WS_MESSAGE_BYTES` | `262144` | Maximum inbound WebSocket message size. |
| `MAX_ROOM_OPERATIONS` | `2000` | Maximum operations after the latest snapshot checkpoint. |
| `MAX_RECENT_OP_IDS` | `4000` | Bounded deduplication window; must be at least operation history size. |
| `MAX_CLIENT_SEND_QUEUE` | `128` | Bounded outbound messages per connection. |
| `MAX_CLIENT_MESSAGES_PER_SECOND` | `120` | Lightweight fixed-window inbound connection limit. |
| `WS_PING_INTERVAL` | `20s` | Transport heartbeat interval. |
| `WS_PONG_TIMEOUT` | `10s` | Heartbeat response timeout. |
| `WS_WRITE_TIMEOUT` | `10s` | Per-message socket write timeout. |
| `SHUTDOWN_TIMEOUT` | `10s` | Bounded graceful shutdown period. |

Durations use Go duration syntax such as `30s`, `15m`, and `4h`. Invalid configuration fails at startup.

## HTTP API

### Health and metrics

- `GET /healthz` and `GET /readyz` return `{"status":"ok"}`.
- `GET /metrics` returns dependency-free Prometheus text metrics.

### Create a room

`POST /v1/rooms` accepts one bounded JSON body:

```json
{"snapshot":{"nodes":[],"edges":[]}}
```

It returns HTTP 201 with `roomId`, a 256-bit URL-safe `roomToken`, `expiresAt`, `maxParticipants`, and `websocketPath`. The full token is never logged.

### Join a room

Connect to:

```text
GET /v1/rooms/{roomToken}/ws?actorId={client-generated-id}&lastSequence={optional-uint64}
```

The request must carry an exact origin listed in `ALLOWED_ORIGINS` when it carries an `Origin` header. Room-not-found, expired, and already-full checks happen before upgrade when observable; room admission is authoritatively serialized during join to prevent races.

## WebSocket protocol v1

All messages are JSON text envelopes with `"v":1`. Canvas-specific meaning stays inside `payload`.

Client messages:

```json
{"v":1,"type":"op.commit","opId":"alice-42","actorId":"alice","payload":{"kind":"node.move"}}
{"v":1,"type":"op.ephemeral","actorId":"alice","payload":{"kind":"node.drag.preview"}}
{"v":1,"type":"presence","actorId":"alice","payload":{"displayName":"Alice","cursor":{"x":10,"y":20}}}
{"v":1,"type":"ping","actorId":"alice"}
```

Server messages use `room.state`, `op.commit`, `presence`, `op.ephemeral`, `ack`, `error`, and `pong`. A committed operation is broadcast in room sequence order and its sender receives an `ack`. Repeating an `opId` returns the original sequence with `"duplicate":true` and does not create another operation.

The joining `room.state` has `stateMode`, `currentSequence`, and `historyStartsAt`:

- `full` contains the latest opaque snapshot checkpoint plus operations after it.
- `replay` contains only operations after the requested `lastSequence`.
- If the requested sequence predates the latest checkpoint, the server falls back to `full`.

To keep a room correct and memory-bounded, a client can attach a full current document as `snapshot` to an `op.commit`. That accepted operation becomes the new opaque checkpoint and compacts older replay operations. When `MAX_ROOM_OPERATIONS` is reached, the next committed operation must include such a checkpoint; otherwise the server sends `checkpoint_required` without sequencing the operation. Go stores this JSON but never interprets it.

Presence is cached only for active connections. Ephemeral and presence messages are never sequenced or retained in operation history. WebSocket control-frame ping/pong provides transport liveness independently of protocol `ping`/`pong`.

## Safety and lifecycle

- Secure room tokens use 32 bytes from `crypto/rand` and base64url encoding.
- Active rooms, HTTP bodies, WebSocket messages, history, dedupe state, message rates, participants, and outbound queues are bounded.
- Unknown fields, malformed JSON, actor mismatch, and unsupported protocol versions fail closed with safe protocol/close codes.
- SIGINT/SIGTERM stops cleanup, closes rooms and active WebSockets, and shuts down HTTP within the configured deadline.
- Logs contain room-token fingerprints and counters, never room tokens, snapshots, or user payloads.

## Tests

```bash
cd realtime
gofmt -w .
go vet ./...
go test ./...
go test -race ./...
go build ./cmd/server
docker build -t recallstack-realtime .
```

Tests cover configuration/protocol validation, secure token uniqueness, room lifecycle and TTL, ten-person admission, concurrent ordering, deduplication, checkpoint compaction and replay fallback, ephemeral fanout, slow-client removal, real WebSocket two-client fanout, participant rejection, and invalid/oversized frames.

## Render deployment

1. Push the repository to GitHub and choose **New > Web Service** in Render.
2. Connect the Recall Stack repository and select **Docker** as the runtime.
3. Set **Root Directory** to `realtime` and **Dockerfile Path** to `./Dockerfile`.
4. Set **Health Check Path** to `/healthz`.
5. Set `ALLOWED_ORIGINS` to the exact production Vercel origin, for example `https://recallstack-three.vercel.app`. Add preview origins explicitly, comma-separated, only if they should possess browser access.
6. Keep `MAX_ROOM_PARTICIPANTS=10`. Set the TTL and limits from `.env.example` or accept their defaults. Render supplies `PORT`; do not hard-code a different public port.
7. Deploy exactly **one instance** and disable autoscaling. Multiple instances would own different in-memory room maps.
8. Confirm `https://YOUR-SERVICE.onrender.com/healthz` and `/readyz` return HTTP 200.

## Manual smoke test without UI changes

Create a room from PowerShell:

```powershell
$base = "https://YOUR-SERVICE.onrender.com"
$origin = "https://recallstack-three.vercel.app"
$created = Invoke-RestMethod -Method Post -Uri "$base/v1/rooms" -Headers @{ Origin = $origin } -ContentType "application/json" -Body '{"snapshot":{"nodes":[],"edges":[]}}'
$created
```

Install/use `websocat`, then open two terminals (replace the token printed above):

```bash
websocat -H='Origin: https://recallstack-three.vercel.app' 'wss://YOUR-SERVICE.onrender.com/v1/rooms/ROOM_TOKEN/ws?actorId=alice'
websocat -H='Origin: https://recallstack-three.vercel.app' 'wss://YOUR-SERVICE.onrender.com/v1/rooms/ROOM_TOKEN/ws?actorId=bob'
```

Each terminal first receives `room.state`. Send from Alice:

```json
{"v":1,"type":"op.commit","opId":"alice-1","actorId":"alice","payload":{"kind":"smoke.test","value":1}}
```

Bob must receive `op.commit` with `sequence:1`; Alice receives the same commit plus `ack`. Then send a different operation from Bob and confirm Alice receives `sequence:2`. Reconnect Bob with `&lastSequence=1` to verify replay.

## Limitations and next phase

This is intentionally single-instance and memory-only. Every room is lost on a process restart, Render restart/sleep, redeploy, or instance replacement. There is no cross-instance synchronization or recovery.

After this service is deployed and validated, the frontend phase can create a room from the existing `SystemDesignDocument`, connect with the native WebSocket API, translate existing reducer mutations into opaque canvas operations, and apply incoming operations through the existing reducer. No frontend integration is included here.
