-- Create combos and combo_items tables
--
-- Note: combos.id is TEXT (e.g. 'family-combo') to match the app's string
-- slug-based IDs used across the frontend.

CREATE TABLE IF NOT EXISTS combos (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  name_ms        TEXT NOT NULL DEFAULT '',
  slug           TEXT NOT NULL UNIQUE,
  description    TEXT NOT NULL DEFAULT '',
  badge          TEXT NOT NULL DEFAULT 'Best Value',
  category_label TEXT NOT NULL DEFAULT '',
  tagline        TEXT NOT NULL DEFAULT '',
  price          DECIMAL(10,2) NOT NULL DEFAULT 0,
  original_value DECIMAL(10,2) NOT NULL DEFAULT 0,
  image          TEXT NOT NULL DEFAULT '',
  images         TEXT[] NOT NULL DEFAULT '{}',
  servings       INTEGER NOT NULL DEFAULT 4,
  highlights     TEXT[] NOT NULL DEFAULT '{}',
  featured       BOOLEAN NOT NULL DEFAULT false,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS combo_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id      TEXT NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  product_id    TEXT NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
  quantity_value DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  selling_unit  TEXT NOT NULL DEFAULT 'piece' CHECK (selling_unit IN ('piece', 'kg', 'pack')),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  custom_label  TEXT,
  preparation   TEXT,
  unit          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_combo_items_combo_id ON combo_items(combo_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_product_id ON combo_items(product_id);
CREATE INDEX IF NOT EXISTS idx_combos_active ON combos(active);
CREATE INDEX IF NOT EXISTS idx_combos_featured ON combos(featured);
CREATE INDEX IF NOT EXISTS idx_combos_slug ON combos(slug);

-- ── Row Level Security ────────────────────────────────────────────────────
-- Consistent with the Product module (anon + authenticated, full CRUD).
ALTER TABLE combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "combos_select_all" ON combos;
CREATE POLICY "combos_select_all" ON combos FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "combos_insert_all" ON combos;
CREATE POLICY "combos_insert_all" ON combos FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "combos_update_all" ON combos;
CREATE POLICY "combos_update_all" ON combos FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "combos_delete_all" ON combos;
CREATE POLICY "combos_delete_all" ON combos FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "combo_items_select_all" ON combo_items;
CREATE POLICY "combo_items_select_all" ON combo_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "combo_items_insert_all" ON combo_items;
CREATE POLICY "combo_items_insert_all" ON combo_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "combo_items_update_all" ON combo_items;
CREATE POLICY "combo_items_update_all" ON combo_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "combo_items_delete_all" ON combo_items;
CREATE POLICY "combo_items_delete_all" ON combo_items FOR DELETE
  TO anon, authenticated USING (true);

-- ── Seed the default family combo ─────────────────────────────────────────
INSERT INTO combos (id, name, name_ms, slug, description, badge, category_label, tagline, price, original_value, image, images, servings, highlights, featured, active)
VALUES (
  'family-combo',
  'Family Combo',
  'Kombo Keluarga',
  'family-combo',
  'Our signature Family Combo brings together the freshest proteins your family needs for a full week of cooking — at an unbeatable price. Every item is prepared fresh the morning of your delivery.',
  'Best Value',
  'Signature Bundle',
  'Everything your family needs. One price.',
  35,
  58,
  '',
  '{}',
  4,
  ARRAY[
    'Save RM23 vs. buying separately',
    'Feeds a family of 4 for 2-3 meals',
    'All items prepared fresh same morning',
    'Mix of proteins for variety all week',
    'Free preparation: cleaned, descaled, cut'
  ],
  true,
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO combo_items (combo_id, product_id, quantity_value, selling_unit, sort_order, custom_label, preparation)
VALUES
  ('family-combo', 'broiler-chicken', 1.00, 'piece', 0, '1 Whole Broiler Chicken (1.5-1.7 kg)', 'cut12'),
  ('family-combo', 'siakap',          1.00, 'piece', 1, '1 Whole Siakap (Asian Sea Bass)',      'gutted'),
  ('family-combo', 'udang-a',         0.50, 'kg',    2, '500g Fresh Grade A Prawns',            NULL),
  ('family-combo', 'cencaru',         1.00, 'kg',    3, '1 kg Cencaru (Torpedo Scad)',          NULL);
