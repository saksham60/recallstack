# JUDGE-01 — fresh production judge sign-in

| Field | Observed value |
| --- | --- |
| UTC timestamp | 2026-10-11 08:10:23–08:10:27 UTC |
| Git SHA / deployment | `9641835b13d10bdad508c895718481146cbf57de`; production deployment SHA was not exposed |
| Operator/evaluator | Codex |
| Environment and client | `https://www.reasonai.tech/login`, fresh headless Chromium browser context, 1440×900 |
| Execution type | Live browser authentication |
| Provider / model | Not applicable |
| Auth mode / seeded data | Public **Continue as Hackathon Judge** flow; no credentials entered or exported |
| Prompt / expected | Click judge sign-in; expect authenticated `/feed` |
| Actual | Login HTTP 200, judge button visible, redirected to `/feed` with no error query parameter |
| Duration | Approximately 3.7 s from script start to finish; navigation and screenshot time included |
| Rubric / verdict | Authentication pass; AI rubric not applicable |
| Known limitations | First capture occurred while the page showed `Loading...`; capture was retried after loading cleared. Feed cards were still refreshing in the signed-in screenshot. This does not establish any AI inference. |
| Redaction review | Codex, 2026-10-11 UTC; screenshots contain no token, cookie, email, personal profile, or room link |
| Artifacts | [Observed browser result](../observed-judge.json), [login screenshot](../../../screenshots/2026-10-11/judge-login-before.png), [signed-in screenshot](../../../screenshots/2026-10-11/judge-login-after.png) |

## Reproduction

Run `node scripts/capture-judge-evidence.mjs` from `web/`. The script creates a fresh context, opens `/login`, waits for the loading state to clear, clicks the judge button, and records the resulting path. Judge mode must be enabled on the production deployment.
