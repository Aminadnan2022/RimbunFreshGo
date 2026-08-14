-- Phase 3: additive, immutable customer preparation snapshots.
-- Legacy Orders remains the authoritative checkout record in this phase.

CREATE TABLE public.order_preparation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_order_id bigint NOT NULL UNIQUE REFERENCES public."Orders"(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  questionnaire_snapshot jsonb NOT NULL CHECK (jsonb_typeof(questionnaire_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX order_preparation_snapshots_customer_idx ON public.order_preparation_snapshots(customer_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.phase3_prevent_preparation_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Order preparation snapshots are immutable.';
END;
$$;

CREATE TRIGGER order_preparation_snapshots_immutable
  BEFORE UPDATE OR DELETE ON public.order_preparation_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.phase3_prevent_preparation_snapshot_mutation();

ALTER TABLE public.order_preparation_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_preparation_snapshots_customer_read ON public.order_preparation_snapshots
  FOR SELECT TO authenticated USING (customer_id = auth.uid() OR public.is_admin() OR public.is_supplier());

-- The legacy Order insert is intentionally performed first by the existing
-- checkout path. This RPC only attaches an additive snapshot to an order the
-- current customer owns; it cannot write another customer's order or prices.
CREATE OR REPLACE FUNCTION public.record_order_preparation_snapshot(
  p_legacy_order_id bigint,
  p_questionnaire_snapshot jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF jsonb_typeof(p_questionnaire_snapshot) <> 'object' THEN RAISE EXCEPTION 'Snapshot must be an object.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public."Orders" o WHERE o.id = p_legacy_order_id AND o.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;
  INSERT INTO public.order_preparation_snapshots (legacy_order_id, customer_id, questionnaire_snapshot, created_by)
  VALUES (p_legacy_order_id, auth.uid(), p_questionnaire_snapshot, auth.uid())
  ON CONFLICT (legacy_order_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM public.order_preparation_snapshots WHERE legacy_order_id = p_legacy_order_id; END IF;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_order_preparation_snapshot(bigint, jsonb) TO authenticated;
