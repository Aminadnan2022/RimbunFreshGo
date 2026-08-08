-- Pin flags, default sort settings, and minimal-update move/normalize
-- RPCs for the admin product/combo sorting.
--
--  is_pinned  BOOLEAN NOT NULL DEFAULT FALSE  on "Product" + combos
--  default_product_sort / default_combo_sort   JSONB rows in site_settings
--  move_product / move_combo    pair-based reorder (only affected rows rewritten)
--  normalize_product_order / normalize_combo_order  re-densify after deletes
--
-- Notes on schema reuse:
--  * display_order  already exists on "Product" + combos (20260805000000).
--  * discount_percent already exists on combos (20260801000003).
--  * "Product" already has freshness (available/limited/sold-out) as its
--    availability/status field, and combos already has active — no new
--    status column is added.
--  * site_settings.value is JSONB, so settings are stored as JSON strings.

-- ── Pin flag (only new column) ────────────────────────────────────────────
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE combos    ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_product_is_pinned ON "Product" (is_pinned DESC, display_order ASC);
CREATE INDEX IF NOT EXISTS idx_combos_is_pinned  ON combos    (is_pinned DESC, display_order ASC);

-- ── Default sort settings (key/value rows, JSONB) ─────────────────────────
INSERT INTO site_settings (key, value) VALUES
  ('default_product_sort', '"manual"'),
  ('default_combo_sort',   '"manual"')
ON CONFLICT (key) DO NOTHING;

-- ── Pair-based reorder: only the moved window is rewritten ──────────────
-- The array is ordered the same way the customer sees it (pinned first, then
-- display_order), so the index passed from the admin UI maps 1:1.
CREATE OR REPLACE FUNCTION move_product(p_id text, p_to_index integer)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_ids  text[];
  v_new  text[];
  v_cur  integer;
  v_to   integer;
  i      integer;
BEGIN
  IF p_id IS NULL OR p_to_index IS NULL THEN RETURN; END IF;

  SELECT array_agg(id ORDER BY is_pinned DESC, display_order ASC, id ASC)
    INTO v_ids FROM "Product";
  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN RETURN; END IF;

  v_cur := NULL;
  FOR i IN 1 .. cardinality(v_ids) LOOP
    IF v_ids[i] = p_id THEN v_cur := i - 1; EXIT; END IF;
  END LOOP;
  IF v_cur IS NULL THEN RETURN; END IF;

  v_to := LEAST(GREATEST(p_to_index, 0), cardinality(v_ids) - 1);
  IF v_to = v_cur THEN RETURN; END IF;

  v_new := '{}';
  FOR i IN 1 .. cardinality(v_ids) LOOP
    IF v_ids[i] <> p_id THEN v_new := array_append(v_new, v_ids[i]); END IF;
  END LOOP;
  v_new := v_new[1:v_to] || ARRAY[p_id] || v_new[v_to + 1:];

  -- Rewrite only the rows whose position actually changed (minimal updates).
  -- display_order is kept dense because every delete path calls
  -- normalize_product_order(), so skipping unchanged positions is safe.
  FOR i IN 1 .. cardinality(v_new) LOOP
    IF v_new[i] IS DISTINCT FROM v_ids[i] THEN
      UPDATE "Product" SET display_order = i - 1 WHERE id = v_new[i];
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION move_combo(p_id text, p_to_index integer)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_ids  text[];
  v_new  text[];
  v_cur  integer;
  v_to   integer;
  i      integer;
BEGIN
  IF p_id IS NULL OR p_to_index IS NULL THEN RETURN; END IF;

  SELECT array_agg(id ORDER BY is_pinned DESC, display_order ASC, id ASC)
    INTO v_ids FROM combos;
  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN RETURN; END IF;

  v_cur := NULL;
  FOR i IN 1 .. cardinality(v_ids) LOOP
    IF v_ids[i] = p_id THEN v_cur := i - 1; EXIT; END IF;
  END LOOP;
  IF v_cur IS NULL THEN RETURN; END IF;

  v_to := LEAST(GREATEST(p_to_index, 0), cardinality(v_ids) - 1);
  IF v_to = v_cur THEN RETURN; END IF;

  v_new := '{}';
  FOR i IN 1 .. cardinality(v_ids) LOOP
    IF v_ids[i] <> p_id THEN v_new := array_append(v_new, v_ids[i]); END IF;
  END LOOP;
  v_new := v_new[1:v_to] || ARRAY[p_id] || v_new[v_to + 1:];

  FOR i IN 1 .. cardinality(v_new) LOOP
    IF v_new[i] IS DISTINCT FROM v_ids[i] THEN
      UPDATE combos SET display_order = i - 1 WHERE id = v_new[i];
    END IF;
  END LOOP;
END;
$$;

-- ── Normalize: re-densify display_order to 0..n-1 (call after deletes) ─────
CREATE OR REPLACE FUNCTION normalize_product_order()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE "Product" p
  SET display_order = r.rn
  FROM (
    SELECT id, row_number() OVER (ORDER BY display_order ASC, id ASC) - 1 AS rn
    FROM "Product"
  ) r
  WHERE p.id = r.id AND p.display_order IS DISTINCT FROM r.rn;
END;
$$;

CREATE OR REPLACE FUNCTION normalize_combo_order()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE combos c
  SET display_order = r.rn
  FROM (
    SELECT id, row_number() OVER (ORDER BY display_order ASC, id ASC) - 1 AS rn
    FROM combos
  ) r
  WHERE c.id = r.id AND c.display_order IS DISTINCT FROM r.rn;
END;
$$;
