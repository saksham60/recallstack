# DSA sandbox configuration and live verification

Configured and tested on 2026-10-15. This establishes ConTree connectivity for the web
server; it does not add a public code-execution endpoint, a queue worker or judging.

## Server configuration

The existing `NEBIUS_API_KEY` is reused. Its value is never placed in a browser variable,
printed by the smoke script, or passed into the sandbox environment.

The following values are saved in the ignored `web/.env.local` and in the connected
Vercel `recallstack` project's **Production** environment:

| Setting | Value |
|---|---|
| `CONTREE_PROJECT` | `tenantuseraccount-e00y54sk4vhryt5kpe` |
| `CONTREE_URL` | `https://api.tokenfactory.nebius.com/sandboxes` |
| `CONTREE_PYTHON_IMAGE` | `4fa16c8f-62a9-35a4-a4ea-07b7e8cd44ae` |

The pinned image already existed under the tag `python:3.12-slim`; the executed interpreter
reported Python **3.12.13**. No image import, tag replacement or persistent result image
was needed. `getConTreeConfiguration()` in `src/lib/config/server.ts` exposes these settings
only to server code. The model inference URL and existing ReasonAI settings are unchanged.

Vercel's existing Production `NEBIUS_API_KEY` remains a sensitive variable and was not
replaced. Preview/Development deployment settings were not provisioned with additional
credentials. The live smoke used the existing local key. Vercel variable presence was
verified through environment metadata; no hosted execution route was deployed or tested.
The saved Production settings will be consumed when sandbox-enabled server code is deployed.

## Client and smoke test

Uses Nebius's official JavaScript `contree-client`, pinned to **0.4.1**, in a Node server
process. The actual request sends the supplied identifier in the documented `Project` header.
The smoke test was run with Node **22.23.3**.

From `web/`, with the existing local key and the settings above:

```sh
npm run sandbox:smoke
```

The script checks authentication and permissions, resolves and inspects the pinned image,
then runs five fixed Python programs sequentially. Every instance is disposable, has
networking disabled, receives an empty explicit environment, uses a bounded execution
timeout, caps recorded output at 4096 bytes per stream, and limits writable-layer size to
128 MiB. It does not run application submissions or access any DSA fixture data.

Observed tests:

| Test | Verified result |
|---|---|
| Python stdout and stderr | `sandbox-ok`, sum 6, exit 0, expected diagnostic on stderr |
| Credential isolation and networking | Secret variable absent; outbound connection blocked |
| Nonzero process exit | Exit 7 and `expected-error` on stderr |
| Excessive stdout | 20000-character output bounded to 4096 recorded characters |
| Execution timeout | Sleeping process terminated; `timedOut=true`, signal 9 |
| Explicit cancellation | Running operation reached terminal `CANCELLED` status |
| Cleanup | Every owned operation terminal; disposable results have no saved image |

The five execution tests include credential/network checks inside the first program.
Authentication advertised spawn, disposable spawn, cancellation, list, import and image-tag
permissions. Effective limits reported a 3600-second maximum instance timeout and 50 concurrent
instances. These provider limits do not implement the future application's stricter global
five-operation cap; that requires the planned durable execution/queue implementation.

The smoke writes a local, ignored report to `.next/cache/contree-smoke.json`, containing only
fixed-program results, operation IDs and non-secret configuration. It cancels any owned
unfinished operation in its cleanup path and never touches another caller's operations.

ConTree returned operation status `SUCCESS` even when the Python process exited 7 or timed
out. Future judging must inspect `metadata.result.state.exitCode`, `timedOut` and the actual
outputs; operation `SUCCESS` is not a verdict that a user's solution passed.

## References

- [Official JavaScript client](https://github.com/nebius/contree-client/blob/master/client-js/README.md)
- [Official client request and execution semantics](https://github.com/nebius/contree-client/blob/master/client/README.md)
