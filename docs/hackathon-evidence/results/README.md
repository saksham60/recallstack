# Raw evaluations — awaiting real measurements

The file [results-template.csv](results-template.csv) contains **only column headings**. No evaluation has been performed merely by adding this file.

Enter **one row per attempted case**, including failures. Required fields: `run_id`, `timestamp_utc`, `git_sha`, `environment`, `suite`, `case_id`, `execution_type`, `outcome`. Allowed execution types: `automated_mock`, `automated_live`, `human`. Outcome: `success`, `failure`, `timeout`, `blocked`, `not_applicable`.

- `duration_ms` includes the complete request/task until terminal completion; blank means unmeasured.
- `score_before` and `score_after` are **0–10** only for human-rated design tasks.
- `trace_ref_redacted` may contain an anonymized reference or internal trace identifier; do not paste URLs granting public access to private traces.
- `notes_public` must contain no emails, names, raw prompts from real users, secrets, API keys or customer data.
- Attach approved, anonymized screenshots separately; link them from the final report after review.

Published success rate for any suite = count(`success`) / all attempted rows in that suite, with `blocked` and `timeout` kept in the denominator. Explain `not_applicable` rows instead of silently excluding them. Do not treat `automated_mock` runs as proof of real Nebius inference.
