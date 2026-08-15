-- Restore required site_settings seed row used by delivery/order limits.
-- The historical migration contains this seed, but the live database is missing it.

INSERT INTO public.site_settings (key, value, updated_at)
VALUES ('max_orders_per_day', '"20"'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
