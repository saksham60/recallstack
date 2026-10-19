-- Mirror the production Supabase migration secure_profiles_owner_rls.
-- The FastAPI database owner/service_role continue managing application profiles.
-- Restrict Supabase Data API access to the authenticated user's own row.

REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon, authenticated;

GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (display_name, avatar_url, timezone) ON TABLE public.profiles TO authenticated;

CREATE POLICY profiles_select_self
ON public.profiles
FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()));

CREATE POLICY profiles_update_self
ON public.profiles
FOR UPDATE TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
