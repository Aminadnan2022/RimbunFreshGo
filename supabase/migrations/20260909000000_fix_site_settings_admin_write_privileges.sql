-- Repair site_settings table privileges to match the existing RLS access model.
--
-- RLS already allows authenticated admins to INSERT / UPDATE / DELETE through
-- site_settings_admin_write, but authenticated lacks the corresponding
-- table-level privileges. PostgreSQL requires both table privileges and RLS.

GRANT INSERT, UPDATE, DELETE
ON TABLE public.site_settings
TO authenticated;
