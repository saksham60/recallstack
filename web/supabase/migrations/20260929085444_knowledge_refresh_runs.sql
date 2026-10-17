CREATE TABLE public.knowledge_refresh_runs (
    id uuid PRIMARY KEY,
    requested_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    requested_at timestamptz NOT NULL,
    status varchar(20) NOT NULL,
    operation_name text NULL,
    checked_at timestamptz NULL,
    CONSTRAINT chk_knowledge_refresh_run_status
        CHECK (status IN ('starting', 'running', 'succeeded', 'failed'))
);
CREATE INDEX ix_knowledge_refresh_runs_requested_at
ON public.knowledge_refresh_runs (requested_at DESC);
ALTER TABLE public.knowledge_refresh_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.knowledge_refresh_runs FROM anon, authenticated;
