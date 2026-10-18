-- Historical production migration 20261018162626 removed the unused temporary pg_net extension.
-- Certificate initiation now uses the signed Vercel cron and Supabase ledger.
-- On fresh installs pg_net is already absent, so this is an intentional no-op.
SELECT 1;
