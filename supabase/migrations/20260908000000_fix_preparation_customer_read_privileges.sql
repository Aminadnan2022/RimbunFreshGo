-- Phase 3: allow the customer-facing preparation questionnaire RPC to read
-- the versioned preparation catalogue under its existing RLS policies.
--
-- get_published_product_preparation_questionnaire() is SECURITY INVOKER, so
-- anon/authenticated require table-level SELECT privileges before PostgreSQL
-- can evaluate the existing published-only RLS policies.

GRANT SELECT ON TABLE public.product_versions
  TO anon, authenticated;

GRANT SELECT ON TABLE public.preparation_schema_versions
  TO anon, authenticated;

GRANT SELECT ON TABLE public.preparation_questions
  TO anon, authenticated;

GRANT SELECT ON TABLE public.preparation_question_options
  TO anon, authenticated;
