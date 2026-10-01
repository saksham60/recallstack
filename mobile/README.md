# ReasonAI mobile

Flutter client for the FastAPI learning API and Next.js ReasonAI chat API.

Copy `.env.example` to `.env` or pass these values with `--dart-define`:

- `API_BASE_URL`: FastAPI base ending in `/api/v1`.
- `WEB_BASE_URL`: Next.js origin, such as `https://reasonai.tech`.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY`: same Supabase project as web and backend. Use only a publishable or legacy anon key in the app.
- `HACKATHON_JUDGE_MODE=true`: shows anonymous judge sign-in.

In the Supabase dashboard, enable **Anonymous sign-ins** before using Judge Mode. Google sign-in requires the Google provider and the existing `com.recallstack.app://login-callback` redirect allowlist entry. The mobile bundle identifier and callback scheme are unchanged.

Saved feed stories are local to this device and account because the backend does not expose a saved stories list. DSA approach and code drafts are local. DSA bookmarks, notes, practice, and reviews use the backend.
