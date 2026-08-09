-- Footer Settings (Website CMS)
-- Stored as key/value rows in site_settings, matching the existing
-- delivery_days / announcement_message pattern.
--
-- Booleans are stored as 'true'/'false' strings; text fields as plain strings.
-- The frontend falls back to FOOTER_SETTINGS_DEFAULTS if a row is missing,
-- so this migration is purely to seed initial editable values.

INSERT INTO site_settings (key, value) VALUES
  -- Footer content (brand name + logo moved to global Branding settings,
  -- see 20260804000000_global_branding.sql)
  ('footer_description',     '"Freshly prepared daily proteins, delivered to your door every {{days}}. Never frozen. Always local."'),

  -- Contact
  ('contact_phone',          '"+60 12-345 6789"'),
  ('contact_whatsapp',       '""'),
  ('contact_email',          '"hello@rimbunfreshgo.my"'),
  ('contact_address',        '"Delivering across Klang Valley, Selangor"'),
  ('delivery_area',          '"Klang Valley, Selangor"'),

  -- Social media (empty = hidden)
  ('social_facebook',        '""'),
  ('social_instagram',       '""'),
  ('social_tiktok',          '""'),
  ('social_threads',         '""'),
  ('social_youtube',         '""'),
  ('social_linkedin',        '""'),
  ('social_x',               '""'),

  -- Footer navigation
  ('footer_show_shop',               'true'),
  ('footer_show_family_combo',       'true'),
  ('footer_show_suppliers',          'true'),
  ('footer_show_recurring_basket',   'true'),
  ('footer_show_faq',                'true'),
  ('footer_show_how_it_works',       'true'),
  ('footer_show_privacy',            'true'),
  ('footer_show_terms',              'true'),

  -- Copyright
  ('copyright_text',        '"© {{year}} Rimbun FreshGo. All rights reserved."')
ON CONFLICT (key) DO NOTHING;
