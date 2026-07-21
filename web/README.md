# RecallStack Web

The RecallStack web application is a Next.js App Router client for the RecallStack API. It uses Supabase authentication, TanStack Query for server state, and generated OpenAPI types for API contracts.

## Requirements

- Node.js 22 or newer
- npm
- A running RecallStack API and Supabase project (local or hosted)

Copy `.env.example` to `.env.local` and set:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Only public browser configuration belongs in `NEXT_PUBLIC_*` variables. Server-only or test-only values must be read from `src/lib/config/server.ts` and must not be re-exported into client modules.

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run build
npm run test:e2e
npm run verify
```

Regenerate the typed API contract after `backend/openapi.json` changes:

```bash
npm run api:generate
```

`src/lib/api/types.ts` is generated and must not be edited manually.

## Architecture

```text
src/
  app/          Routes, layouts, and route-level boundaries
  components/   Shared layout and UI primitives
  features/     Feature-owned screens, components, hooks, keys, and types
  lib/          API, configuration, Query, and Supabase infrastructure
```

The dependency direction is:

```text
app -> features -> components/ui + lib
```

Application-shell components under `components/layout` may compose auth, profile, and search features. Generic UI components must not import features.

### Engineering rules

1. Route pages compose feature screens; reusable workflows live in `features`.
2. Backend calls go through `src/lib/api/client.ts` and generated OpenAPI types.
3. Query keys are owned and exported by the feature caching that data.
4. Cross-feature invalidation imports the owner key; it never duplicates a string key.
5. Await invalidation when mutation pending state depends on refreshed data.
6. Transport bodies may use snake_case; component props and local state use camelCase.
7. External consumers use explicit feature entrypoints. Feature internals use relative imports.
8. Key-only cross-feature dependencies import the feature's `keys.ts` module to avoid pulling client barrels into lower-level modules.
9. Shared UI and `lib` never import feature UI.
10. Browser-only and server-only modules must remain separated.
11. Generated transport types are used directly unless a real UI normalization is needed.
12. TanStack Query owns remote/cache state; ephemeral interaction state stays local.
13. Query-driven screens handle loading, error, and empty states.
14. E2E response factories should satisfy generated API schemas.
15. Add an abstraction only when it removes demonstrated repetition or enforces a meaningful boundary.

### Feature public APIs

Feature `index.ts` files contain explicit exports. Do not use broad `export *` chains and do not import a feature from its own barrel. Modules needed by another feature's data layer, such as query keys, remain stable public subpaths (`@/features/catalog/keys`).

## Authentication

Supabase responsibilities are separated as follows:

- `lib/supabase/client.ts`: singleton browser client
- `lib/supabase/server.ts`: request-scoped server client
- `lib/supabase/middleware.ts`: cookie refresh and route protection
- `proxy.ts`: request interception and development-only E2E bypass
- `features/auth/AuthProvider.tsx`: client session state and auth actions

The E2E bypass is disabled whenever `NODE_ENV=production`. Playwright starts a development server and installs an exact Supabase-compatible auth cookie through `e2e/helpers/auth.ts`.

## Testing

E2E tests live by feature under `e2e/`. Authenticated tests should use `e2e/fixtures/authenticated-test.ts`. Reusable schema-shaped responses belong in `e2e/helpers/factories.ts`; avoid wildcard auth mocks and arbitrary sleeps.
