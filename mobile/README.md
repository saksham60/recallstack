# ReasonAI Mobile

Flutter client for ReasonAI's learning and knowledge experience. The mobile app is intentionally focused on the workflows that make sense on a phone: Knowledge Feed, Ask ReasonAI, DSA learning, revision, saved material, search, profile and preferences.

System Design canvas collaboration remains a web-only capability today. The mobile app does not embed the Konva canvas, the Go realtime room protocol, or System Design editing.

This README documents the current mobile implementation and its boundaries. It distinguishes server-authoritative state, device-local state, streamed AI state, and capabilities that exist in the backend but are not yet wired into Flutter.

---

## 1. Position in the ReasonAI architecture

```text
                         ReasonAI Mobile
                    Flutter + Riverpod + Dio
                              |
             +----------------+----------------+
             |                                 |
             v                                 v
      FastAPI backend                    Next.js web runtime
      API_BASE_URL                       WEB_BASE_URL
      /api/v1/...                        /api/reasonai/...
             |                                 |
             |                                 +--> LangGraph / ReasonAI
             |                                 +--> Nemotron
             |                                 +--> Tavily tools
             |                                 +--> durable AI conversation state
             |
             +--> catalog/content
             +--> learning progress
             +--> notes/bookmarks
             +--> practice/reviews
             +--> Knowledge Feed
             +--> feed events/preferences
             +--> Supabase-backed PostgreSQL

      Supabase Auth
             |
             +--> Google OAuth
             +--> anonymous Hackathon Judge sessions

      Device-local Drift / SQLite
             |
             +--> saved-story cache for Library
             +--> DSA approach drafts
             +--> DSA code drafts
```

There are therefore three distinct data planes in the mobile application:

1. **FastAPI product state** - authoritative user/content state.
2. **Next.js ReasonAI runtime** - streamed AI interaction state and orchestration.
3. **Drift device state** - local UX persistence that should survive navigation/app restarts on the same account/device.

These are deliberately not collapsed into one generic "mobile state" layer.

---

## 2. Technology stack

| Concern | Implementation |
| --- | --- |
| UI | Flutter / Material |
| State management | Riverpod |
| Navigation | go_router |
| HTTP | Dio |
| Authentication | Supabase Flutter |
| Device persistence | Drift + SQLite |
| Network images | cached_network_image |
| Markdown | flutter_markdown |
| Sharing | share_plus |
| External links | url_launcher |
| IDs / idempotency | uuid |
| Build-time/local config | `--dart-define` and `.env` fallback |

The Dart SDK constraint is currently `^3.8.1`.

---

## 3. Source layout

```text
mobile/
├── lib/
│   ├── app/
│   │   ├── app.dart
│   │   ├── env.dart
│   │   └── router.dart
│   │
│   ├── core/
│   │   ├── api/
│   │   │   ├── api_client.dart
│   │   │   ├── api_failure.dart
│   │   │   └── safe_url.dart
│   │   ├── auth/
│   │   │   └── auth_repository.dart
│   │   ├── db/
│   │   │   └── app_database.dart
│   │   ├── reasonai/
│   │   │   ├── reasonai_client.dart
│   │   │   ├── reasonai_events.dart
│   │   │   ├── reasonai_state.dart
│   │   │   ├── reasonai_stream.dart
│   │   │   ├── reasonai_widgets.dart
│   │   │   └── visual_lesson.dart
│   │   └── telemetry/
│   │       └── app_logger.dart
│   │
│   ├── features/
│   │   ├── identity/
│   │   ├── feed/
│   │   ├── dsa/
│   │   ├── revise/
│   │   ├── library/
│   │   └── profile/
│   │
│   └── shared/
│       ├── theme/
│       └── widgets/
│
├── android/
├── ios/
├── test/
├── pubspec.yaml
└── README.md
```

The project is feature-oriented at the UI layer and keeps transport/auth/database/ReasonAI concerns under `core/`.

---

## 4. App shell and navigation

The application is built with `MaterialApp.router` and a `GoRouter` exposed through Riverpod.

The authenticated shell has five persistent branches:

```text
Feed
DSA
Revise
Library
Me
```

The shell uses `StatefulShellRoute.indexedStack`, so each branch can retain its own navigation stack while the user switches tabs.

Primary routes:

```text
/login
/feed
/story/:storyId
/dsa
/dsa/categories/:categoryId
/dsa/problems/:slug
/revise
/library
/me
```

### Auth redirect policy

Routing is centrally protected:

- unauthenticated navigation outside `/login` redirects to login,
- the desired destination is preserved in `from`,
- an authenticated user visiting `/login` or `/splash` is redirected to `/feed`,
- auth-state changes call `router.refresh()`.

This avoids implementing login checks separately in every feature screen.

---

## 5. Authentication

Mobile authentication is provided by Supabase Auth.

Supported application flows include:

### Google OAuth

```text
Mobile
  |
  v
Supabase OAuth
  |
  v
Google
  |
  v
com.recallstack.app://login-callback
  |
  v
Supabase mobile session
```

The configured redirect is:

```text
com.recallstack.app://login-callback
```

The redirect must remain allowlisted in the Supabase project configuration.

### Hackathon Judge Mode

When `HACKATHON_JUDGE_MODE=true`, the app can expose anonymous Supabase sign-in for a frictionless judge session.

Supabase anonymous authentication must be enabled for this to work.

### Session ownership

`AuthRepository` owns:

- the current Supabase session,
- auth-state events,
- Google login,
- judge login,
- logout,
- session refresh.

Refresh is single-flight: concurrent callers reuse the same in-progress refresh future rather than starting multiple refresh operations.

---

## 6. Network architecture

Mobile intentionally uses two Dio clients because ReasonAI AI traffic and product API traffic have different hosts and response semantics.

### 6.1 FastAPI client

`backendDioProvider` points to:

```text
API_BASE_URL
```

`API_BASE_URL` must include `/api/v1`.

Example:

```text
https://<cloud-run-service>/api/v1
```

The backend client automatically attaches:

```http
Authorization: Bearer <Supabase access token>
```

### 401 recovery

The FastAPI interceptor implements one controlled retry:

```text
request
  |
  v
401
  |
  v
refresh Supabase session
  |
  +--> refresh failed --> sign out / propagate error
  |
  v
retry original request once
```

The retried request is marked so a second `401` does not enter an infinite refresh loop.

Default FastAPI transport timeouts:

- connect: 15 seconds,
- receive: 30 seconds.

### 6.2 ReasonAI client

`reasonAIDioProvider` points to:

```text
WEB_BASE_URL
```

Example:

```text
https://reasonai.tech
```

Current ReasonAI mobile endpoints are:

```text
POST /api/reasonai/dsa/chat
POST /api/reasonai/knowledge/chat
```

The ReasonAI client requires an authenticated Supabase access token and requests:

```http
Accept: application/x-ndjson
Content-Type: application/json
Authorization: Bearer <access token>
```

The client also has a narrowly-scoped canonical redirect retry for:

```text
https://reasonai.tech
      ->
https://www.reasonai.tech
```

Only the expected HTTPS `308` canonical redirect with the same path/query is followed automatically.

Default ReasonAI transport timeouts:

- connect: 15 seconds,
- receive: 120 seconds.

---

## 7. ReasonAI streaming protocol on mobile

Mobile does not wait for one large JSON AI response. It understands ReasonAI's versioned NDJSON event protocol.

### Stream lifecycle

```text
Flutter sends request
      |
      v
Next.js ReasonAI route
      |
      v
application/x-ndjson
      |
      v
run.started
      |
      +--> text.delta
      +--> text.final
      +--> tool.started
      +--> tool.completed / tool.failed
      +--> sources.ready
      +--> visual.ready
      +--> run.heartbeat
      |
      v
run.completed / run.failed / run.cancelled
```

### Protocol validation

The mobile stream layer verifies that:

- the first streaming event is `run.started`,
- protocol version is supported,
- a run ID is present,
- sequence numbers are non-negative,
- later events belong to the same run,
- duplicate/out-of-order sequence numbers are ignored,
- known event payloads contain the required fields,
- source records contain at least title and URL,
- a terminal run event is eventually received.

Unknown future event types can be ignored without corrupting the current reducer.

### Stream watchdog

The stream watchdog resets on valid events and aborts after 120 seconds without progress.

An unexpectedly ended non-terminal stream becomes an interrupted run rather than being silently treated as success.

### Non-stream fallback

The stream layer can also return a `NonStreamResponse` when the server intentionally returns regular JSON. DSA uses this for compatibility/replay cases.

---

## 8. Mobile ReasonAI state reducer

`ChatState` contains:

```text
messages
run status
runId
last sequence
error
```

Each assistant message can accumulate:

- streamed text parts,
- tool execution state,
- web sources,
- structured visual lessons,
- notices.

The reducer is sequence-aware:

```text
if event.runId != active run -> ignore
if event.seq <= lastSeq       -> ignore
otherwise                     -> reduce
```

This protects the UI from duplicate or late NDJSON events.

The mobile-composed local history sent back with a request is intentionally bounded to the last 12 completed user/assistant messages, with each message capped before serialization.

This local history is conversational context supplied by the client. For DSA, it is not the only memory layer: the server-side ReasonAI runtime can also maintain durable conversation/learner memory.

---

## 9. DSA mobile architecture

DSA is the deepest mobile learning workflow.

### 9.1 Browse flow

```text
DSA tab
  |
  v
GET domains/dsa/categories
  |
  v
category dashboard
  |
  v
GET categories/:id/content
  |
  v
problem list
  |
  v
GET content/:slug
  |
  v
study note / practice workspace
```

Category data includes learner progress. Problem lists expose difficulty, progress state and bookmark state.

### 9.2 Problem workspace

A problem screen has four working areas:

```text
Problem | Approach | Code | Notes
```

The **Problem** view renders the published study material and practice-resource link.

The **Approach** and **Code** tabs are editable learner workspaces.

The **Notes** tab uses server-authoritative private notes.

### 9.3 Local DSA drafts

Approach and code are saved to Drift locally.

Writes are debounced by approximately 500 ms while editing, and the latest state is also persisted when the screen disposes.

The local table is keyed by content ID:

```text
DsaDrafts
- contentId
- approach
- code
- updatedAt
```

This is device-local draft protection. It is not currently synchronized through the backend device-sync protocol.

### 9.4 Bookmarks and notes

DSA bookmarks and notes are server-authoritative:

```text
PUT/DELETE me/bookmarks/:contentId
POST me/notes
GET me/content/:contentId/notes
```

Bookmark UI is optimistic and rolls back if the request fails.

### 9.5 Practice result

When a user opens the external practice resource and returns, the app can submit an outcome such as:

```text
solved_independently
solved_with_hint
understood_but_could_not_code
pattern_not_identified
skipped
```

The mobile client generates an `attempt_event_id` UUID. Backend practice logic remains authoritative for deduplication, progress updates and initial review scheduling.

---

## 10. DSA Ask ReasonAI

The DSA tutor sends far more than the raw question.

The request can contain:

```text
action
message
searchWeb
hintLevel
problem context
recent chat history
conversationId
webContextToken
visualFocus
idempotencyKey
```

### DSA context builder

The mobile app constructs bounded context from the current study note and learner workspace, including where available:

- content ID,
- slug,
- title,
- difficulty,
- category,
- source/provider,
- source URL,
- summary,
- companies,
- remarks,
- learner approach,
- learner notes,
- learner code.

Context fields are capped before transmission to prevent an unbounded mobile request.

### Tutor actions

Current tutor actions include:

```text
chat
hint
explain
start
trace
visualize
review
complexity
research
solution
```

The UI also supports toggling web search.

### Progressive hints

The mobile layer keeps a `hintLevel` and increments it when the user asks for another hint. That hint level is sent to the ReasonAI server runtime, which decides how much guidance to reveal.

### Conversation identity

The DSA route can return:

```text
X-ReasonAI-Conversation-Id
X-ReasonAI-Run-Id
```

Mobile retains these IDs for the active tutor session.

This enables:

- durable server-side conversation identity,
- active-run tracking,
- explicit cancellation,
- run-in-progress conflict handling,
- replay/idempotency behavior.

### Idempotency

Each new DSA request gets a UUID `idempotencyKey`.

On retry, the logical request is reused but receives a fresh idempotency key while retaining the conversation ID.

A `409 RUN_IN_PROGRESS` is surfaced as an explicit "ReasonAI is still answering your last question" state instead of starting overlapping work.

### Stop/cancel

Stopping does both:

1. cancels the local Dio stream,
2. if `conversationId` and `runId` are known, calls the server cancellation route.

This prevents the UI from merely hiding an AI run that is still executing remotely.

### Web research and citations

When web search is enabled, `sources.ready` updates the chat message with structured sources and can return a `webContextToken` for subsequent turns.

### Visual lessons

`visual.ready` is parsed into a structured `VisualLesson` rather than rendered from arbitrary executable content.

The learner can select a visual step and then ask ReasonAI specifically about that step; mobile sends a compact `visualFocus` containing lesson title, step number and step title.

---

## 11. Revision / spaced-review experience

The **Revise** tab retrieves due review cards from the backend.

Flow:

```text
GET me/reviews/due
      |
      v
show card
      |
      v
Reveal
      |
      +--> Again
      +--> Hard
      +--> Good
      +--> Easy
      |
      v
POST me/reviews/:cardId/submit
```

The submission includes backend concurrency fields such as the card row version and a client-generated review event ID through the DSA API layer.

If the server reports a concurrency conflict, the app invalidates and reloads the due-review collection instead of overwriting newer state.

The scheduling algorithm itself is backend-owned; Flutter presents and submits the learner decision.

---

## 12. Knowledge Feed mobile architecture

### 12.1 Feed state

`FeedController` owns:

```text
topic
stories
cursor
hasMore
initial loading state
load-more state
page/global failures
```

The controller cancels stale in-flight requests and uses a generation counter so a response from an earlier feed request cannot replace newer state.

### 12.2 Cursor pagination

Feed pagination uses the backend-provided cursor rather than mobile-generated offsets.

```text
load first page
   |
   +--> items
   +--> nextCursor
   +--> hasMore
            |
            v
       loadMore()
```

Duplicate story IDs are removed when appending additional pages.

The ranking policy and cursor integrity remain backend-owned.

### 12.3 Feed behavior events

Mobile records user behavior so the backend can maintain authoritative story state and preference signals.

Current event types used by the product include:

```text
VIEW
SAVE
UNSAVE
HIDE
UNHIDE
ASK_REASONAI
```

Other backend-supported event types can be added without changing the feed architecture.

### VIEW batching

A story view is recorded once per controller lifetime and queued locally in memory.

VIEW events flush:

- after roughly 750 ms, or
- when the batch reaches 100 events.

Event IDs are client-generated UUIDs.

This reduces request chatter without moving event semantics to the device.

### Optimistic SAVE / UNSAVE

Save state updates optimistically in the current feed list.

On successful server event:

- saving writes a device-local `SavedStories` cache row,
- unsaving removes it.

On server failure, the optimistic feed state is rolled back.

### HIDE / UNHIDE

Hide immediately removes the story from the visible list, then emits the backend event.

If the request fails, the story is restored at its prior index where possible.

Undo emits `UNHIDE` and refreshes the feed.

---

## 13. Feed personalization

The mobile preference sheet reads the profile's Knowledge Feed preferences from FastAPI and allows the learner to change:

- selected topic interests,
- free-form interest prompt.

The interest prompt is capped in the UI at 500 characters.

Only changed fields are sent back to the backend. After a successful update, the app invalidates the preference provider and refreshes the feed.

### What "learning" means here

The mobile app is not training an LLM.

It contributes durable behavior/preference signals such as:

```text
viewed this story
saved this story
hid this story
asked ReasonAI about this story
selected these interests
wrote this interest prompt
```

The backend owns persistence and ranking interpretation.

Any future learned affinity model would consume this state server-side. It is not a Flutter model-training loop.

---

## 14. Ask ReasonAI from a story

A Knowledge story opens a modal ReasonAI conversation.

Flow:

```text
Story
  |
  v
Ask ReasonAI
  |
  +--> current story context
  +--> user message
  +--> bounded recent dialog history
  |
  v
POST /api/reasonai/knowledge/chat
  |
  v
NDJSON stream
  |
  +--> answer deltas
  +--> tool state
  +--> sources
  +--> terminal status
```

Quick prompts currently include examples such as:

```text
Explain this
Why does this matter?
Give me a practical example
Interview angle
Show me more like this
Latest developments
```

The mobile sheet supports:

- stop,
- retry,
- streamed answer rendering,
- sources,
- tool progress.

The dialog itself is sheet-scoped local state today. Closing the sheet discards the local rendered thread, although server-side request processing and underlying Knowledge events remain independent.

---

## 15. Device-local Drift database

The app creates a separate SQLite location per authenticated user:

```text
<app-documents>/reasonai/<userId>/reasonai.sqlite
```

This prevents two accounts on the same device from sharing the same local library/draft rows.

Current schema version: `1`.

### SavedStories

```text
id              primary key
title
sourceName
imageUrl
publishedAt
savedAt
```

Used by the mobile Library's **Saved** tab.

### DsaDrafts

```text
contentId       primary key
approach
code
updatedAt
```

Used to protect unfinished DSA work.

### Important boundary

Drift is currently a **local UX persistence layer**, not a complete offline replica of ReasonAI.

The backend already exposes device registration, mutation-ledger, incremental-sync and full-resync capabilities, but the current Flutter source does not contain the corresponding end-to-end device-sync engine.

Therefore:

```text
Implemented today
-----------------
local DSA drafts
local saved-story cache
server API state
normal online mutation/retry behavior

Not implemented in Flutter today
--------------------------------
full offline catalog mirror
offline mutation queue
sync cursor ownership
full-resync snapshot/ACK workflow
background reconciliation engine
```

Do not describe the current mobile client as fully offline-first until that integration is added.

---

## 16. Library

The Library contains three distinct sources of information.

### Saved

Reads from Drift's per-user `SavedStories` cache.

Removing an item first reconciles with the backend's current story state where possible, then performs the appropriate UNSAVE/local cleanup behavior.

Because the backend currently does not expose a general "list all saved stories" endpoint for this UI, this tab is intentionally a local cache of stories saved on this device/account.

### Bookmarks

Reads DSA bookmarks from FastAPI.

These are server-authoritative and can therefore follow the user across devices.

### Search

Searches DSA content through the backend.

The UI:

- starts searching after at least two characters,
- debounces input by about 350 ms,
- cancels the previous Dio request,
- uses a generation guard to reject stale results.

---

## 17. Profile

The **Me** tab retrieves the backend `/me` projection and combines it with local application metadata.

Current capabilities include:

- display name/avatar,
- Hackathon Judge session indicator,
- Knowledge Feed personalization entrypoint,
- installed app version/build number,
- sign out.

Remote avatar URLs are validated before use and have a deterministic local fallback.

---

## 18. State ownership matrix

| State | Owner | Durable | Cross-device | Notes |
| --- | --- | ---: | ---: | --- |
| Supabase auth session | Supabase SDK/device | Yes | Session-specific | Provides bearer token |
| Feed stories | FastAPI | Yes | Yes | Ranked/paginated server result |
| Feed preferences | FastAPI/PostgreSQL | Yes | Yes | Explicit learner preferences |
| Feed event history/projections | FastAPI/PostgreSQL | Yes | Yes | SAVE/HIDE/VIEW/etc. |
| Saved-story Library cache | Drift | Yes | No | Per device/account |
| DSA catalog/content | FastAPI/PostgreSQL | Yes | Yes | Server-authoritative |
| DSA bookmarks | FastAPI/PostgreSQL | Yes | Yes | Server-authoritative |
| DSA notes | FastAPI/PostgreSQL | Yes | Yes | Server-authoritative |
| DSA progress | FastAPI/PostgreSQL | Yes | Yes | Server-authoritative |
| Practice attempts | FastAPI/PostgreSQL | Yes | Yes | Immutable/idempotent server writes |
| Review schedule/history | FastAPI/PostgreSQL | Yes | Yes | Backend scheduler owns semantics |
| DSA approach/code draft | Drift | Yes | No | Local draft protection |
| DSA local chat reducer | Flutter memory | No | No | Active sheet state |
| DSA ReasonAI conversation | Next.js ReasonAI runtime | Yes where server persists it | Yes through server identity | Conversation/run IDs returned to mobile |
| DSA learner memory | ReasonAI server layer | Yes where enabled | Yes | Not stored in Drift |
| Story Ask ReasonAI dialog | Flutter memory + server request | Local dialog: No | No | Sheet-scoped conversation UI today |
| System Design shared canvas | Web + Go realtime | N/A on mobile | N/A | Mobile does not implement this surface |

---

## 19. Failure and recovery behavior

The mobile app treats failures according to the owner of the operation.

### Normal API failure

`ApiFailure` converts transport/server errors into bounded user-facing states rather than exposing raw exception details.

### Backend 401

Attempt one Supabase refresh and retry once. If authentication remains invalid, sign out rather than creating an infinite retry loop.

### ReasonAI stream interruption

The chat becomes `interrupted` and exposes retry/stop behavior.

### ReasonAI HTTP error

Known status codes have bounded mobile messages. Server-provided safe `error`/`code` fields can be surfaced when present.

### Stale UI response

Feed/search flows use cancellation tokens plus generation IDs, preventing older requests from overwriting newer user intent.

### Optimistic mutation failure

SAVE/HIDE/bookmark UI is restored to the prior state where the feature supports optimistic updates.

### Review conflict

Reload the authoritative due-card collection rather than overwriting another update.

---

## 20. Security boundaries

### Secrets

Never ship server/provider secrets in Flutter.

Allowed mobile configuration includes only values intended for an untrusted installed client, such as:

- FastAPI public base URL,
- Next.js public base URL,
- Supabase project URL,
- Supabase publishable/anon key.

Do **not** add:

- Supabase service-role keys,
- Nebius keys,
- Tavily keys,
- R2 secret keys,
- database credentials,
- LangSmith server credentials.

### Bearer identity

The application passes the Supabase access token. Backend/ReasonAI services derive identity from the verified token rather than a profile ID supplied by Flutter.

### URL handling

External/source URLs are validated through safe URL helpers before navigation or use.

### ReasonAI structured output

Visual lessons and sources are parsed against expected structures. The app does not treat arbitrary model text as executable mobile code.

### Local account separation

SQLite storage paths are partitioned by authenticated user ID.

---

## 21. System Design and realtime boundary

System Design is intentionally absent from the current mobile feature tree.

The Flutter app does **not** currently contain:

```text
Konva/canvas equivalent
Go realtime room client
room token sharing
presence/cursors
op.commit / ACK / replay protocol
shared drag/resize/freehand previews
System Design ReasonAI proposal application
```

Those capabilities remain in the web + realtime architecture.

This is an intentional product/platform boundary, not an undocumented mobile feature.

If System Design is introduced on mobile later, it should consume the same stable document/protocol contracts rather than introducing a second incompatible collaboration model.

---

## 22. Environment configuration

Copy the example file:

```bash
cd mobile
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Current variables:

```text
API_BASE_URL
WEB_BASE_URL
SUPABASE_URL
SUPABASE_ANON_KEY
HACKATHON_JUDGE_MODE
```

Example development values:

```text
API_BASE_URL=http://10.0.2.2:8080/api/v1
WEB_BASE_URL=https://reasonai.tech
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-publishable-or-anon-key
HACKATHON_JUDGE_MODE=false
```

`10.0.2.2` is the Android emulator route to the host machine.

Values may also be passed explicitly with `--dart-define`.

---

## 23. Local development

Prerequisites:

- Flutter stable compatible with the repository,
- Dart compatible with `^3.8.1`,
- Android Studio/SDK for Android development,
- Xcode for iOS development on macOS.

Install dependencies:

```bash
cd mobile
flutter pub get
```

Generate Drift/codegen outputs when required:

```bash
dart run build_runner build --delete-conflicting-outputs
```

Run:

```bash
flutter run \
  --dart-define=API_BASE_URL=http://10.0.2.2:8080/api/v1 \
  --dart-define=WEB_BASE_URL=https://reasonai.tech \
  --dart-define=SUPABASE_URL=https://your-project.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=your-publishable-key \
  --dart-define=HACKATHON_JUDGE_MODE=false
```

PowerShell uses backticks instead of backslashes for line continuation.

---

## 24. Android builds

### Debug APK

The project CI builds a debug APK:

```bash
flutter build apk --debug
```

A debug build does not require the production keystore.

### Release APK

The Android release configuration expects:

```text
android/key.properties
```

with release signing information.

If a true release build is requested without `key.properties`, Gradle intentionally fails rather than silently producing a debug-signed release artifact.

Do not commit the keystore or `key.properties`.

---

## 25. CI quality gate

The mobile GitHub Actions workflow runs on changes under `mobile/**`.

Current CI sequence:

```text
flutter pub get
      |
      v
dart run build_runner build --delete-conflicting-outputs
      |
      v
dart format --output=none --set-exit-if-changed .
      |
      v
flutter analyze
      |
      v
flutter test
      |
      v
flutter build apk --debug
```

The CI environment uses Flutter stable and Java 17.

Before merging substantial mobile changes, run the same format/analyze/test/build sequence locally.

---

## 26. Current implemented capability matrix

| Capability | Mobile status |
| --- | --- |
| Supabase auth | Implemented |
| Google login | Implemented |
| Hackathon anonymous judge login | Implemented when enabled |
| Knowledge Feed | Implemented |
| Feed cursor pagination | Implemented |
| Feed preference editing | Implemented |
| Feed events | Implemented |
| Saved story local Library | Implemented |
| Ask ReasonAI on Feed story | Implemented |
| ReasonAI NDJSON streaming | Implemented |
| Tool status rendering | Implemented |
| Source/citation rendering | Implemented |
| DSA browse/read | Implemented |
| DSA local approach/code drafts | Implemented |
| DSA bookmarks/notes | Implemented |
| DSA practice result submission | Implemented |
| DSA Ask ReasonAI | Implemented |
| Progressive hints | Implemented |
| DSA web research | Implemented through ReasonAI runtime |
| Structured visual lessons | Implemented |
| DSA server conversation identity | Implemented |
| Remote ReasonAI run cancellation | Implemented |
| Due-review workflow | Implemented |
| DSA search | Implemented |
| Profile/app version | Implemented |
| Full backend device-sync engine | Not wired into Flutter yet |
| Fully offline DSA catalog | Not implemented |
| System Design canvas | Web-only |
| Go realtime collaboration | Web-only |
| Git Repo -> Canvas | Not a current mobile feature |

---

## 27. Engineering rules for future mobile work

1. **Keep server-authoritative state server-authoritative.** Do not create a competing local truth for progress, review schedules, feed ranking, notes or bookmarks.
2. **Keep Drift scoped to intentional local UX state** until the backend sync protocol is integrated end-to-end.
3. **Do not place provider secrets in Flutter.** Mobile is an untrusted public client.
4. **Use the shared ReasonAI event reducer** instead of creating feature-specific ad-hoc stream parsers.
5. **Preserve idempotency IDs** for learner mutations and AI runs where the server contract supports them.
6. **Cancel stale network work** when search/filter/navigation intent changes.
7. **Keep bounded contexts and histories.** Do not send the full device database or unbounded chat history to ReasonAI.
8. **Treat model output as untrusted structured data.** Parse and validate before rendering advanced UI.
9. **Do not claim full offline-first behavior** until mutation queues, cursors, device ownership and full-resync are implemented in Flutter.
10. **Do not duplicate System Design collaboration semantics** if mobile canvas support is added later; reuse the canonical document and realtime contracts.

---

## 28. Architectural summary

```text
ReasonAI Mobile

Flutter UI
   |
   +--> Riverpod state
   |
   +--> GoRouter/auth shell
   |
   +--> FastAPI Dio -----------------------------------------+
   |       |                                                  |
   |       +--> feed                                         |
   |       +--> preferences/events                           |
   |       +--> DSA catalog/content                          |
   |       +--> bookmarks/notes                              |
   |       +--> practice/reviews                             |
   |                                                          v
   |                                                   PostgreSQL
   |
   +--> ReasonAI Dio
   |       |
   |       +--> /api/reasonai/dsa/chat
   |       +--> /api/reasonai/knowledge/chat
   |       |
   |       v
   |   NDJSON event stream
   |       |
   |       +--> text
   |       +--> tools
   |       +--> citations
   |       +--> visuals
   |       +--> run lifecycle
   |
   +--> Drift / SQLite
           |
           +--> local saved-story cache
           +--> local DSA drafts

System Design canvas + Go realtime
           |
           X
     not implemented on mobile today
```

The mobile application is therefore not a miniature copy of the web application. It is a focused ReasonAI client with a native learning/feed experience, strong separation of state ownership, a first-class streaming AI protocol, and deliberate local persistence where it improves mobile UX without competing with server truth.
