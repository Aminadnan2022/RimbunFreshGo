-- Global Branding (Website CMS)
-- The site logo is a global branding asset, not a footer-only value.
--
-- 1. Create the `branding` storage bucket (mirrors product-images).
-- 2. Seed `site_name` / `site_logo` key/value rows in site_settings.
--    These hold the storage path (e.g. branding/logo.webp), NOT a public URL.
-- 3. Migrate any existing footer-level brand_name/brand_logo values and
--    remove those obsolete keys.

-- 1. Storage bucket + policies
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
  'branding',
  'branding',
  true,
  false,
  3145728, -- 3 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- NOTE: Policy names are unique per table. 20260729000001 already created
-- "Public Access" / "Authenticated users can ..." on storage.objects for the
-- product-images bucket, so the branding policies below are prefixed to allow
-- both buckets' policies to coexist on the shared storage.objects table.

CREATE POLICY "Branding Public Access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'branding');

CREATE POLICY "Branding Authenticated users can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'branding');

CREATE POLICY "Branding Authenticated users can update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'branding');

CREATE POLICY "Branding Authenticated users can delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'branding');

-- 2. Migrate old footer-level brand values into the global keys
INSERT INTO site_settings (key, value)
SELECT 'site_name', value FROM site_settings WHERE key = 'brand_name'
ON CONFLICT (key) DO NOTHING;

INSERT INTO site_settings (key, value)
SELECT 'site_logo', value FROM site_settings WHERE key = 'brand_logo'
ON CONFLICT (key) DO NOTHING;

-- 3. Remove the obsolete footer-level brand keys
DELETE FROM site_settings WHERE key IN ('brand_name', 'brand_logo');

-- 4. Ensure defaults exist
INSERT INTO site_settings (key, value) VALUES
  ('site_name', '"Rimbun FreshGo"'),
  ('site_logo', '""')
ON CONFLICT (key) DO NOTHING;
