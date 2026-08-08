/*
# Delivery Manifest (extends Delivery Batches)

## Summary
The Delivery Manifest is the preparation screen shown to the admin (and rider)
before the rider leaves the hub. It summarises every order in a Delivery Batch:
order count, delivery points, product totals, plus per-order Packed/Loaded
checklists.

No new statuses are introduced on `delivery_batches`. The manifest reuses the
existing Dispatch Workflow RPC `admin_mark_ready_for_rider` for the final
"Ready For Rider" action.

## New table
- `delivery_batch_manifest` — per-order Packed / Loaded state for a batch.
  Rows are created lazily (UPSERT) whenever an admin/supplier toggles a flag.
  Nothing else in the app reads this table directly.

## New RPCs (SECURITY DEFINER)
- `manifest_set_packed(batch, order, packed)`  — supplier or admin toggles Packed
- `manifest_set_loaded(batch, order, loaded)`  — admin toggles Loaded

Only the Delivery Batch module is touched: `delivery_batches` is unchanged and
no columns are added to `"Orders"`.
*/

-- 1. Per-order checklist table
CREATE TABLE IF NOT EXISTS public.delivery_batch_manifest (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id    uuid        NOT NULL REFERENCES public.delivery_batches(id) ON DELETE CASCADE,
  order_id    bigint      NOT NULL REFERENCES "Orders"(id) ON DELETE CASCADE,
  packed      boolean     NOT NULL DEFAULT false,
  loaded      boolean     NOT NULL DEFAULT false,
  packed_at   timestamptz,
  loaded_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_manifest_batch ON public.delivery_batch_manifest (batch_id);

-- RLS: read/write is admin-only (the RPCs below are SECURITY DEFINER and run as
-- the owner, so they bypass this for suppliers too).
ALTER TABLE public.delivery_batch_manifest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_manifest" ON public.delivery_batch_manifest;
CREATE POLICY "admin_select_manifest" ON public.delivery_batch_manifest
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin_write_manifest" ON public.delivery_batch_manifest;
CREATE POLICY "admin_write_manifest" ON public.delivery_batch_manifest
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_manifest" ON public.delivery_batch_manifest;
CREATE POLICY "admin_update_manifest" ON public.delivery_batch_manifest
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 2. Toggle Packed (supplier or admin)
CREATE OR REPLACE FUNCTION public.manifest_set_packed(
  p_batch_id uuid, p_order_id bigint, p_packed boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_supplier()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.delivery_batch_manifest (batch_id, order_id, packed, packed_at)
  VALUES (p_batch_id, p_order_id, p_packed, CASE WHEN p_packed THEN now() ELSE NULL END)
  ON CONFLICT (batch_id, order_id)
  DO UPDATE SET
    packed      = EXCLUDED.packed,
    packed_at   = CASE WHEN EXCLUDED.packed THEN now() ELSE NULL END,
    updated_at  = now();
END;
$$;

-- 3. Toggle Loaded (admin only)
CREATE OR REPLACE FUNCTION public.manifest_set_loaded(
  p_batch_id uuid, p_order_id bigint, p_loaded boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.delivery_batch_manifest (batch_id, order_id, loaded, loaded_at)
  VALUES (p_batch_id, p_order_id, p_loaded, CASE WHEN p_loaded THEN now() ELSE NULL END)
  ON CONFLICT (batch_id, order_id)
  DO UPDATE SET
    loaded      = EXCLUDED.loaded,
    loaded_at   = CASE WHEN EXCLUDED.loaded THEN now() ELSE NULL END,
    updated_at  = now();
END;
$$;