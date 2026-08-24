-- Storefront combo pages are public. RLS already limits both tables to
-- published recipes; grant the table privilege needed for those policies to
-- be reachable through PostgREST.

BEGIN;

GRANT SELECT ON TABLE public.combo_versions, public.combo_version_items TO anon, authenticated;

COMMIT;
