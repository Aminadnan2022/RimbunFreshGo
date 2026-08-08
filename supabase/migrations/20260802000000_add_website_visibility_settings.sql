-- Website Visibility settings (website management)
-- Stored as key/value rows in site_settings, matching the existing
-- delivery_days / pickup_locations pattern.
--
-- All booleans default to TRUE except maintenance_mode (FALSE).
-- The frontend also falls back to these defaults if a row is missing,
-- so this migration is purely to make the settings visible/edit-first-run.

INSERT INTO site_settings (key, value) VALUES
  ('show_shop',                  'true'),
  ('show_family_combo',          'true'),
  ('show_suppliers',             'true'),
  ('show_recurring_basket',      'true'),

  ('show_home_featured_products',  'true'),
  ('show_home_featured_combos',    'true'),
  ('show_home_suppliers',          'true'),
  ('show_home_testimonials',       'true'),
  ('show_home_delivery_schedule',  'true'),
  ('show_home_why_freshgo',        'true'),

  ('allow_customer_registration', 'true'),
  ('allow_customer_orders',       'true'),

  ('maintenance_mode',            'false')
ON CONFLICT (key) DO NOTHING;
