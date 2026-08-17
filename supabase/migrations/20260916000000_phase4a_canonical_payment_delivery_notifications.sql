-- Phase 4A: canonical payment, delivery configuration, receipts, and notifications.
-- Legacy public."Orders" remains untouched. This migration prepares the canonical
-- sales model before the Phase 4B checkout cutover.

-- -----------------------------------------------------------------------------
-- 1. Effective-dated configuration
-- -----------------------------------------------------------------------------
CREATE TABLE public.payment_configuration_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  configuration_code text NOT NULL CHECK (btrim(configuration_code) <> ''),
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  qr_storage_path text,
  instructions text,
  currency_code text NOT NULL DEFAULT 'MYR' CHECK (currency_code ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT payment_configuration_versions_period_check
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT payment_configuration_versions_key
    UNIQUE (configuration_code, version_number)
);

CREATE TABLE public.delivery_method_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_code text NOT NULL CHECK (method_code IN ('instant_customer_lalamove', 'normal_bulk')),
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  fee_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  currency_code text NOT NULL DEFAULT 'MYR' CHECK (currency_code ~ '^[A-Z]{3}$'),
  external_provider text,
  external_booking_url text,
  customer_pays_external_provider boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT delivery_method_versions_period_check
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT delivery_method_versions_key UNIQUE (method_code, version_number),
  CONSTRAINT delivery_method_versions_external_check CHECK (
    (customer_pays_external_provider = false AND external_provider IS NULL)
    OR (customer_pays_external_provider = true AND btrim(COALESCE(external_provider, '')) <> '')
  )
);

CREATE TABLE public.delivery_method_version_days (
  delivery_method_version_id uuid NOT NULL REFERENCES public.delivery_method_versions(id) ON DELETE RESTRICT,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  PRIMARY KEY (delivery_method_version_id, weekday)
);

CREATE TABLE public.delivery_method_version_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_method_version_id uuid NOT NULL REFERENCES public.delivery_method_versions(id) ON DELETE RESTRICT,
  start_time time NOT NULL,
  end_time time NOT NULL,
  CHECK (end_time > start_time),
  UNIQUE (delivery_method_version_id, start_time, end_time)
);

CREATE TABLE public.delivery_method_version_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_method_version_id uuid NOT NULL REFERENCES public.delivery_method_versions(id) ON DELETE RESTRICT,
  zone_code text NOT NULL CHECK (btrim(zone_code) <> ''),
  zone_name text NOT NULL CHECK (btrim(zone_name) <> ''),
  zone_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(zone_snapshot) = 'object'),
  UNIQUE (delivery_method_version_id, zone_code)
);

CREATE OR REPLACE FUNCTION public.phase4a_prevent_published_configuration_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'published' THEN
    RAISE EXCEPTION 'Published configuration versions are immutable.';
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'published'
     AND NEW.status = 'retired'
     AND NEW.effective_to IS NOT NULL
     AND current_setting('freshgo.configuration_retire', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Published configuration versions are immutable; retire and publish a new version.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_configuration_versions_immutable
  BEFORE UPDATE OR DELETE ON public.payment_configuration_versions
  FOR EACH ROW EXECUTE FUNCTION public.phase4a_prevent_published_configuration_mutation();
CREATE TRIGGER delivery_method_versions_immutable
  BEFORE UPDATE OR DELETE ON public.delivery_method_versions
  FOR EACH ROW EXECUTE FUNCTION public.phase4a_prevent_published_configuration_mutation();

CREATE OR REPLACE FUNCTION public.phase4a_prevent_published_configuration_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'published' AND EXISTS (
    SELECT 1
    FROM public.payment_configuration_versions v
    WHERE v.configuration_code = NEW.configuration_code
      AND v.id <> NEW.id
      AND v.status = 'published'
      AND tstzrange(v.effective_from, v.effective_to, '[)')
          && tstzrange(NEW.effective_from, NEW.effective_to, '[)')
  ) THEN
    RAISE EXCEPTION 'Published payment configuration periods may not overlap.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.phase4a_prevent_delivery_configuration_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'published' AND EXISTS (
    SELECT 1
    FROM public.delivery_method_versions v
    WHERE v.method_code = NEW.method_code
      AND v.id <> NEW.id
      AND v.status = 'published'
      AND tstzrange(v.effective_from, v.effective_to, '[)')
          && tstzrange(NEW.effective_from, NEW.effective_to, '[)')
  ) THEN
    RAISE EXCEPTION 'Published delivery configuration periods may not overlap.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_configuration_versions_no_overlap
  BEFORE INSERT OR UPDATE ON public.payment_configuration_versions
  FOR EACH ROW EXECUTE FUNCTION public.phase4a_prevent_published_configuration_overlap();
CREATE TRIGGER delivery_method_versions_no_overlap
  BEFORE INSERT OR UPDATE ON public.delivery_method_versions
  FOR EACH ROW EXECUTE FUNCTION public.phase4a_prevent_delivery_configuration_overlap();

CREATE OR REPLACE FUNCTION public.phase4a_prevent_delivery_child_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version_id uuid := COALESCE(NEW.delivery_method_version_id, OLD.delivery_method_version_id);
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.delivery_method_versions
    WHERE id = v_version_id AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'Children of a published delivery configuration are immutable.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER delivery_method_version_days_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.delivery_method_version_days
  FOR EACH ROW EXECUTE FUNCTION public.phase4a_prevent_delivery_child_mutation();
CREATE TRIGGER delivery_method_version_windows_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.delivery_method_version_windows
  FOR EACH ROW EXECUTE FUNCTION public.phase4a_prevent_delivery_child_mutation();
CREATE TRIGGER delivery_method_version_zones_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.delivery_method_version_zones
  FOR EACH ROW EXECUTE FUNCTION public.phase4a_prevent_delivery_child_mutation();

CREATE OR REPLACE FUNCTION public.publish_payment_configuration_version(p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payment_configuration_versions
    WHERE id = p_version_id AND status = 'draft' AND qr_storage_path IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Payment configuration must be draft and have a QR storage path.';
  END IF;
  UPDATE public.payment_configuration_versions
     SET status = 'published', published_at = now(), published_by = auth.uid()
   WHERE id = p_version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_delivery_method_version(p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_method_code text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  SELECT method_code INTO v_method_code
  FROM public.delivery_method_versions
  WHERE id = p_version_id AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery configuration must be draft.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.delivery_method_version_days WHERE delivery_method_version_id = p_version_id)
     OR NOT EXISTS (SELECT 1 FROM public.delivery_method_version_windows WHERE delivery_method_version_id = p_version_id) THEN
    RAISE EXCEPTION 'Delivery configuration requires at least one day and time window.';
  END IF;
  IF v_method_code = 'normal_bulk'
     AND NOT EXISTS (SELECT 1 FROM public.delivery_method_version_zones WHERE delivery_method_version_id = p_version_id) THEN
    RAISE EXCEPTION 'Normal bulk delivery requires at least one eligible zone.';
  END IF;
  UPDATE public.delivery_method_versions
     SET status = 'published', published_at = now(), published_by = auth.uid()
   WHERE id = p_version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.retire_payment_configuration_version(
  p_version_id uuid,
  p_effective_to timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  PERFORM set_config('freshgo.configuration_retire', 'on', true);
  UPDATE public.payment_configuration_versions
     SET status = 'retired', effective_to = p_effective_to
   WHERE id = p_version_id AND status = 'published' AND p_effective_to > effective_from;
  IF NOT FOUND THEN RAISE EXCEPTION 'Published payment configuration version not found or invalid retirement time.'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.retire_delivery_method_version(
  p_version_id uuid,
  p_effective_to timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  PERFORM set_config('freshgo.configuration_retire', 'on', true);
  UPDATE public.delivery_method_versions
     SET status = 'retired', active = false, effective_to = p_effective_to
   WHERE id = p_version_id AND status = 'published' AND p_effective_to > effective_from;
  IF NOT FOUND THEN RAISE EXCEPTION 'Published delivery configuration version not found or invalid retirement time.'; END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Canonical order and line projections
-- -----------------------------------------------------------------------------
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS requires_supplier_finalisation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_status text NOT NULL DEFAULT 'final',
  ADD COLUMN IF NOT EXISTS estimated_subtotal numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_total numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_subtotal numeric(12,2),
  ADD COLUMN IF NOT EXISTS final_total numeric(12,2),
  ADD COLUMN IF NOT EXISTS price_finalised_at timestamptz,
  ADD COLUMN IF NOT EXISTS price_finalised_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS receipt_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_configuration_version_id uuid REFERENCES public.payment_configuration_versions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS payment_configuration_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_configuration_version_id uuid REFERENCES public.delivery_method_versions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS delivery_configuration_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.sales_order_lines
  ADD COLUMN IF NOT EXISTS ordering_mode text,
  ADD COLUMN IF NOT EXISTS estimated_line_total numeric(12,2),
  ADD COLUMN IF NOT EXISTS estimated_supplier_cost numeric(12,2),
  ADD COLUMN IF NOT EXISTS final_line_total numeric(12,2),
  ADD COLUMN IF NOT EXISTS final_supplier_cost numeric(12,2),
  ADD COLUMN IF NOT EXISTS finalised_at timestamptz;

ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_price_status_check
    CHECK (price_status IN ('estimated', 'final')),
  ADD CONSTRAINT sales_orders_payment_status_check
    CHECK (payment_status IN ('pending', 'receipt_submitted', 'rejected', 'paid'));

ALTER TABLE public.sales_order_lines
  ADD CONSTRAINT sales_order_lines_estimated_total_check
    CHECK (estimated_line_total IS NULL OR estimated_line_total >= 0),
  ADD CONSTRAINT sales_order_lines_estimated_cost_check
    CHECK (estimated_supplier_cost IS NULL OR estimated_supplier_cost >= 0),
  ADD CONSTRAINT sales_order_lines_final_total_check
    CHECK (final_line_total IS NULL OR final_line_total >= 0),
  ADD CONSTRAINT sales_order_lines_final_cost_check
    CHECK (final_supplier_cost IS NULL OR final_supplier_cost >= 0);

CREATE INDEX sales_orders_price_payment_idx
  ON public.sales_orders (price_status, payment_status, created_at DESC);
CREATE INDEX sales_orders_delivery_configuration_idx
  ON public.sales_orders (delivery_configuration_version_id);

-- The phase-1 trigger remains in force for ordinary writes. Lifecycle RPCs use
-- a transaction-local operation name, and this trigger compares OLD/NEW after
-- removing only the columns permitted for that operation.
CREATE OR REPLACE FUNCTION public.phase1_prevent_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operation text := current_setting('freshgo.canonical_operation', true);
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Order snapshots are append-only. DELETE is never allowed.';
  END IF;

  IF TG_TABLE_NAME = 'sales_orders' AND v_operation = 'price_finalisation'
     AND (to_jsonb(NEW) - ARRAY['price_status', 'final_subtotal', 'final_total',
       'subtotal', 'total', 'price_finalised_at', 'price_finalised_by'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['price_status', 'final_subtotal', 'final_total',
       'subtotal', 'total', 'price_finalised_at', 'price_finalised_by']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_orders' AND v_operation = 'receipt_submission'
     AND (to_jsonb(NEW) - ARRAY['payment_status', 'receipt_submitted_at'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['payment_status', 'receipt_submitted_at']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_orders' AND v_operation = 'payment_rejection'
     AND (to_jsonb(NEW) - ARRAY['payment_status'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['payment_status']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_orders' AND v_operation = 'payment_confirmation'
     AND (to_jsonb(NEW) - ARRAY['payment_status', 'paid_at', 'paid_by'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['payment_status', 'paid_at', 'paid_by']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_order_lines' AND v_operation = 'price_finalisation'
     AND (to_jsonb(NEW) - ARRAY['actual_weight_kg', 'final_line_total',
       'final_supplier_cost', 'finalised_at', 'line_total'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['actual_weight_kg', 'final_line_total',
       'final_supplier_cost', 'finalised_at', 'line_total']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_order_line_units' AND v_operation = 'price_finalisation'
     AND (to_jsonb(NEW) - ARRAY['actual_weight_kg'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['actual_weight_kg']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Unexpected or unauthorized canonical mutation.';
END;
$$;

CREATE OR REPLACE FUNCTION public.phase4a_validate_order_transitions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operation text := current_setting('freshgo.canonical_operation', true);
BEGIN
  IF NEW.price_status IS DISTINCT FROM OLD.price_status
     AND NOT (OLD.price_status = 'estimated' AND NEW.price_status = 'final'
              AND v_operation = 'price_finalisation') THEN
    RAISE EXCEPTION 'Invalid price_status transition.';
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     AND NOT (
       (OLD.payment_status IN ('pending', 'rejected')
        AND NEW.payment_status = 'receipt_submitted'
        AND v_operation = 'receipt_submission')
       OR (OLD.payment_status = 'receipt_submitted'
           AND NEW.payment_status = 'rejected'
           AND v_operation = 'payment_rejection')
       OR (OLD.payment_status = 'receipt_submitted'
           AND NEW.payment_status = 'paid'
           AND v_operation = 'payment_confirmation')
     ) THEN
    RAISE EXCEPTION 'Invalid payment_status transition.';
  END IF;

  IF OLD.payment_status = 'paid'
     AND NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    RAISE EXCEPTION 'Paid orders are terminal.';
  END IF;
  IF NEW.payment_status = 'paid'
     AND (NEW.price_status <> 'final' OR NEW.paid_at IS NULL OR NEW.paid_by IS NULL) THEN
    RAISE EXCEPTION 'Paid orders require final pricing and payment provenance.';
  END IF;
  IF NEW.payment_status = 'receipt_submitted'
     AND NEW.receipt_submitted_at IS NULL THEN
    RAISE EXCEPTION 'Receipt-submitted orders require receipt_submitted_at.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_orders_transition_guard
  BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.phase4a_validate_order_transitions();

CREATE TABLE public.supplier_users (
  supplier_id bigint NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (supplier_id, user_id)
);

CREATE INDEX supplier_users_user_idx
  ON public.supplier_users (user_id, active);

ALTER TABLE public.supplier_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY phase4a_supplier_users_admin_all ON public.supplier_users
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
CREATE POLICY phase4a_supplier_users_self_select ON public.supplier_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_supplier());

CREATE OR REPLACE FUNCTION public.is_supplier_for_sales_order(p_sales_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_supplier()
     AND EXISTS (
       SELECT 1
       FROM public.supplier_users su
       JOIN public.sales_order_lines l ON l.supplier_id = su.supplier_id
       WHERE su.user_id = auth.uid()
         AND su.active
         AND l.sales_order_id = p_sales_order_id
     );
$$;

CREATE OR REPLACE FUNCTION public.phase4a_assert_supplier_paid(p_sales_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (public.is_supplier_for_sales_order(p_sales_order_id) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Supplier or admin access required.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_orders
    WHERE id = p_sales_order_id AND payment_status = 'paid' AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Payment must be verified before preparation, packing, or dispatch.';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Receipts, notifications, and reminder idempotency
-- -----------------------------------------------------------------------------
CREATE TABLE public.sales_order_payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  storage_path text NOT NULL CHECK (btrim(storage_path) <> ''),
  original_file_name text NOT NULL DEFAULT '',
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size integer NOT NULL CHECK (file_size > 0 AND file_size <= 5242880),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  verification_status text NOT NULL DEFAULT 'submitted' CHECK (verification_status IN ('submitted', 'rejected', 'accepted')),
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX sales_order_payment_receipts_one_submitted
  ON public.sales_order_payment_receipts (sales_order_id)
  WHERE verification_status = 'submitted';
CREATE INDEX sales_order_payment_receipts_order_idx
  ON public.sales_order_payment_receipts (sales_order_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.phase4a_prevent_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_operation text := current_setting('freshgo.canonical_operation', true);
BEGIN
  IF TG_OP = 'UPDATE'
     AND (
       (v_operation = 'payment_rejection'
        AND (to_jsonb(NEW) - ARRAY['verification_status', 'verified_at', 'verified_by', 'rejection_reason'])
          IS NOT DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['verification_status', 'verified_at', 'verified_by', 'rejection_reason']))
       OR (v_operation = 'payment_confirmation'
        AND (to_jsonb(NEW) - ARRAY['verification_status', 'verified_at', 'verified_by'])
          IS NOT DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['verification_status', 'verified_at', 'verified_by']))
     ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Payment receipt history is append-only.';
END;
$$;

CREATE TRIGGER sales_order_payment_receipts_append_only
  BEFORE UPDATE OR DELETE ON public.sales_order_payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.phase4a_prevent_receipt_mutation();

CREATE OR REPLACE FUNCTION public.phase4a_validate_receipt_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_operation text := current_setting('freshgo.canonical_operation', true);
BEGIN
  IF NOT (
    OLD.verification_status = 'submitted'
    AND (
      (NEW.verification_status = 'rejected' AND v_operation = 'payment_rejection')
      OR (NEW.verification_status = 'accepted' AND v_operation = 'payment_confirmation')
    )
  ) THEN
    RAISE EXCEPTION 'Payment receipt verification state is terminal or invalid.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_order_payment_receipts_transition_guard
  BEFORE UPDATE ON public.sales_order_payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.phase4a_validate_receipt_transition();

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_role text,
  sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  notification_type text NOT NULL CHECK (btrim(notification_type) <> ''),
  title text NOT NULL CHECK (btrim(title) <> ''),
  message text NOT NULL CHECK (btrim(message) <> ''),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (recipient_user_id IS NOT NULL OR recipient_role IS NOT NULL)
);

CREATE INDEX notifications_recipient_idx
  ON public.notifications (recipient_user_id, read_at, created_at DESC);
CREATE INDEX notifications_order_idx
  ON public.notifications (sales_order_id, created_at DESC);
CREATE UNIQUE INDEX notifications_user_order_type_unique
  ON public.notifications (recipient_user_id, sales_order_id, notification_type)
  WHERE recipient_user_id IS NOT NULL AND sales_order_id IS NOT NULL;

CREATE TABLE public.payment_reminder_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code text NOT NULL UNIQUE CHECK (btrim(rule_code) <> ''),
  enabled boolean NOT NULL DEFAULT true,
  first_delay_minutes integer NOT NULL CHECK (first_delay_minutes > 0),
  repeat_interval_minutes integer NOT NULL CHECK (repeat_interval_minutes > 0),
  maximum_reminders integer NOT NULL CHECK (maximum_reminders > 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE public.payment_reminder_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  reminder_rule_id uuid NOT NULL REFERENCES public.payment_reminder_rules(id) ON DELETE RESTRICT,
  occurrence_number integer NOT NULL CHECK (occurrence_number > 0),
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sales_order_id, reminder_rule_id, occurrence_number)
);

-- -----------------------------------------------------------------------------
-- 4. RLS and private receipt storage
-- -----------------------------------------------------------------------------
ALTER TABLE public.payment_configuration_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_method_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_method_version_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_method_version_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_method_version_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminder_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminder_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY phase4a_payment_config_admin_all ON public.payment_configuration_versions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY phase4a_delivery_config_admin_all ON public.delivery_method_versions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY phase4a_delivery_days_admin_all ON public.delivery_method_version_days
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY phase4a_delivery_windows_admin_all ON public.delivery_method_version_windows
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY phase4a_delivery_zones_admin_all ON public.delivery_method_version_zones
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY phase4a_receipts_customer_select ON public.sales_order_payment_receipts
  FOR SELECT TO authenticated USING (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.sales_orders o WHERE o.id = sales_order_id AND o.customer_id = auth.uid())
    OR public.is_admin()
  );
CREATE POLICY phase4a_notifications_recipient_select ON public.notifications
  FOR SELECT TO authenticated USING (
    recipient_user_id = auth.uid() OR public.is_admin()
    OR (recipient_user_id IS NULL AND recipient_role = CASE
      WHEN public.is_delivery_rider() THEN 'delivery_rider'
      WHEN public.is_admin() THEN 'admin'
      ELSE ''
    END)
  );
-- Supplier notifications remain stored as role-targeted rows until the
-- repository has a real supplier.id -> auth.users.id assignment relation.
-- No supplier receives them through RLS rather than leaking all supplier rows.
CREATE POLICY phase4a_reminder_rules_admin_all ON public.payment_reminder_rules
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY phase4a_reminder_attempts_admin_select ON public.payment_reminder_attempts
  FOR SELECT TO authenticated USING (public.is_admin());

INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
  'sales-order-payment-receipts', 'sales-order-payment-receipts', false, false, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY phase4a_receipt_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sales-order-payment-receipts'
    AND (
      public.is_admin()
      OR (
        name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\\.(jpg|jpeg|png|webp|pdf)$'
        AND EXISTS (
          SELECT 1 FROM public.sales_orders o
          WHERE o.id = split_part(name, '/', 1)::uuid
            AND o.customer_id = auth.uid()
        )
      )
    )
  );
CREATE POLICY phase4a_receipt_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'sales-order-payment-receipts'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.sales_orders o
        WHERE name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\\.(jpg|jpeg|png|webp|pdf)$'
          AND o.id = split_part(name, '/', 1)::uuid
          AND o.customer_id = auth.uid()
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Controlled canonical lifecycle RPCs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_sales_order_pricing(
  p_sales_order_id uuid,
  p_line_weights jsonb,
  p_unit_weights jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_line record;
  v_actual_weight numeric(12,3);
  v_final_line_total numeric(12,2);
  v_final_supplier_cost numeric(12,2);
  v_subtotal numeric(12,2);
  v_supplier_cost numeric(12,2);
BEGIN
  IF NOT (public.is_supplier_for_sales_order(p_sales_order_id) OR public.is_admin()) THEN RAISE EXCEPTION 'Supplier or admin access required.'; END IF;
  IF jsonb_typeof(p_line_weights) <> 'array' OR jsonb_typeof(p_unit_weights) <> 'array' THEN RAISE EXCEPTION 'Weight inputs must be JSON arrays.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sales_orders WHERE id = p_sales_order_id AND status <> 'cancelled') THEN RAISE EXCEPTION 'Order not found or cancelled.'; END IF;
  IF EXISTS (SELECT 1 FROM public.sales_orders WHERE id = p_sales_order_id AND price_status = 'final') THEN RAISE EXCEPTION 'Order pricing is already final.'; END IF;

  PERFORM set_config('freshgo.canonical_operation', 'price_finalisation', true);

  UPDATE public.sales_order_line_units u
     SET actual_weight_kg = x.actual_weight_kg
    FROM jsonb_to_recordset(p_unit_weights) AS x(unit_id uuid, actual_weight_kg numeric)
   WHERE u.id = x.unit_id
     AND EXISTS (SELECT 1 FROM public.sales_order_lines l WHERE l.id = u.sales_order_line_id AND l.sales_order_id = p_sales_order_id)
     AND x.actual_weight_kg >= 0;

  FOR v_line IN
    SELECT l.*, COALESCE(w.actual_weight_kg, SUM(u.actual_weight_kg)) AS supplied_weight
    FROM public.sales_order_lines l
    LEFT JOIN jsonb_to_recordset(p_line_weights) AS w(line_id uuid, actual_weight_kg numeric) ON w.line_id = l.id
    LEFT JOIN public.sales_order_line_units u ON u.sales_order_line_id = l.id
    WHERE l.sales_order_id = p_sales_order_id
    GROUP BY l.id, w.actual_weight_kg
  LOOP
    IF v_line.ordering_mode IN ('whole_fish_by_weight', 'weight_only', 'slice') THEN
      v_actual_weight := v_line.supplied_weight;
      IF v_actual_weight IS NULL OR v_actual_weight < 0 THEN RAISE EXCEPTION 'Missing actual weight for line %.', v_line.id; END IF;
    ELSE
      v_actual_weight := v_line.actual_weight_kg;
    END IF;
    v_final_line_total := CASE
      WHEN v_line.ordering_mode IN ('whole_fish_by_weight', 'weight_only', 'slice')
        THEN round(v_line.unit_selling_price * v_actual_weight, 2)
      ELSE round(v_line.unit_selling_price * v_line.quantity, 2)
    END;
    v_final_supplier_cost := CASE
      WHEN v_line.unit_cost_price IS NULL THEN NULL
      WHEN v_line.ordering_mode IN ('whole_fish_by_weight', 'weight_only', 'slice')
        THEN round(v_line.unit_cost_price * v_actual_weight, 2)
      ELSE round(v_line.unit_cost_price * v_line.quantity, 2)
    END;
    UPDATE public.sales_order_lines
       SET actual_weight_kg = CASE WHEN v_actual_weight IS NULL THEN actual_weight_kg ELSE v_actual_weight END,
           final_line_total = greatest(v_final_line_total - discount_amount, 0),
           final_supplier_cost = v_final_supplier_cost,
           finalised_at = now(),
           line_total = greatest(v_final_line_total - discount_amount, 0)
     WHERE id = v_line.id;
  END LOOP;

  SELECT COALESCE(sum(final_line_total), 0), COALESCE(sum(final_supplier_cost), 0)
    INTO v_subtotal, v_supplier_cost
    FROM public.sales_order_lines WHERE sales_order_id = p_sales_order_id;

  UPDATE public.sales_orders
     SET price_status = 'final', final_subtotal = v_subtotal,
         final_total = v_subtotal + delivery_fee - discount_amount,
         subtotal = v_subtotal, total = v_subtotal + delivery_fee - discount_amount,
         price_finalised_at = now(), price_finalised_by = auth.uid()
   WHERE id = p_sales_order_id;

  INSERT INTO public.sales_order_events (sales_order_id, event_type, actor_id, payload)
  VALUES (p_sales_order_id, 'price_finalised', auth.uid(), jsonb_build_object('final_subtotal', v_subtotal, 'final_total', v_subtotal + (SELECT delivery_fee FROM public.sales_orders WHERE id = p_sales_order_id)));
  INSERT INTO public.notifications (recipient_user_id, recipient_role, sales_order_id, notification_type, title, message, payload)
  SELECT customer_id, 'customer', id, 'price_finalised', 'Final order price ready', 'Your final order price is ready. Please complete payment.', jsonb_build_object('final_total', final_total)
  FROM public.sales_orders WHERE id = p_sales_order_id AND customer_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_sales_order_payment_receipt(
  p_sales_order_id uuid,
  p_storage_path text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_receipt_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sales_orders WHERE id = p_sales_order_id AND customer_id = auth.uid() AND status <> 'cancelled' AND price_status = 'final' AND payment_status IN ('pending', 'rejected')) THEN RAISE EXCEPTION 'Payment receipt is not currently allowed.'; END IF;
  IF p_storage_path NOT LIKE p_sales_order_id::text || '/%' THEN RAISE EXCEPTION 'Receipt path must belong to the order.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'sales-order-payment-receipts'
      AND name = p_storage_path
  ) THEN
    RAISE EXCEPTION 'Receipt Storage object does not exist in the payment-receipts bucket.';
  END IF;
  PERFORM set_config('freshgo.canonical_operation', 'receipt_submission', true);
  INSERT INTO public.sales_order_payment_receipts (sales_order_id, storage_path, original_file_name, mime_type, file_size, uploaded_by)
  VALUES (p_sales_order_id, p_storage_path, p_original_file_name, p_mime_type, p_file_size, auth.uid()) RETURNING id INTO v_receipt_id;
  UPDATE public.sales_orders SET payment_status = 'receipt_submitted', receipt_submitted_at = now() WHERE id = p_sales_order_id;
  INSERT INTO public.sales_order_events (sales_order_id, event_type, actor_id, payload) VALUES (p_sales_order_id, 'payment_receipt_submitted', auth.uid(), jsonb_build_object('receipt_id', v_receipt_id));
  INSERT INTO public.notifications (recipient_role, sales_order_id, notification_type, title, message, payload) VALUES ('admin', p_sales_order_id, 'payment_receipt_submitted', 'Payment receipt received', 'A payment receipt is ready for verification.', jsonb_build_object('receipt_id', v_receipt_id));
  RETURN v_receipt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_sales_order_payment_receipt(p_receipt_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_order_id uuid; v_customer_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  SELECT sales_order_id INTO v_order_id FROM public.sales_order_payment_receipts WHERE id = p_receipt_id AND verification_status = 'submitted' FOR UPDATE;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'Submitted receipt not found.'; END IF;
  SELECT customer_id INTO v_customer_id FROM public.sales_orders WHERE id = v_order_id;
  PERFORM set_config('freshgo.canonical_operation', 'payment_rejection', true);
  UPDATE public.sales_order_payment_receipts SET verification_status = 'rejected', verified_at = now(), verified_by = auth.uid(), rejection_reason = p_reason WHERE id = p_receipt_id;
  UPDATE public.sales_orders SET payment_status = 'rejected' WHERE id = v_order_id;
  INSERT INTO public.sales_order_events (sales_order_id, event_type, actor_id, payload) VALUES (v_order_id, 'payment_receipt_rejected', auth.uid(), jsonb_build_object('receipt_id', p_receipt_id, 'reason', p_reason));
  INSERT INTO public.notifications (recipient_user_id, recipient_role, sales_order_id, notification_type, title, message, payload) VALUES (v_customer_id, 'customer', v_order_id, 'payment_receipt_rejected', 'Payment receipt needs attention', 'Your payment receipt was rejected. Please submit a new receipt.', jsonb_build_object('receipt_id', p_receipt_id, 'reason', p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_sales_order_payment(p_receipt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_order_id uuid; v_customer_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  SELECT sales_order_id INTO v_order_id FROM public.sales_order_payment_receipts WHERE id = p_receipt_id AND verification_status = 'submitted' FOR UPDATE;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'Submitted receipt not found.'; END IF;
  SELECT customer_id INTO v_customer_id FROM public.sales_orders WHERE id = v_order_id AND price_status = 'final' AND payment_status = 'receipt_submitted';
  IF NOT FOUND THEN RAISE EXCEPTION 'Order is not awaiting payment verification.'; END IF;
  PERFORM set_config('freshgo.canonical_operation', 'payment_confirmation', true);
  UPDATE public.sales_order_payment_receipts SET verification_status = 'accepted', verified_at = now(), verified_by = auth.uid() WHERE id = p_receipt_id;
  UPDATE public.sales_orders SET payment_status = 'paid', paid_at = now(), paid_by = auth.uid() WHERE id = v_order_id;
  INSERT INTO public.sales_order_events (sales_order_id, event_type, actor_id, payload) VALUES (v_order_id, 'payment_confirmed', auth.uid(), jsonb_build_object('receipt_id', p_receipt_id));
  INSERT INTO public.notifications (recipient_user_id, recipient_role, sales_order_id, notification_type, title, message, payload)
  VALUES (v_customer_id, 'customer', v_order_id, 'payment_confirmed', 'Payment confirmed', 'Your payment has been confirmed.', jsonb_build_object('receipt_id', p_receipt_id))
  ON CONFLICT DO NOTHING;
  INSERT INTO public.notifications (recipient_user_id, recipient_role, sales_order_id, notification_type, title, message, payload)
  SELECT su.user_id, 'supplier', v_order_id, 'payment_confirmed', 'Order paid',
         'The order has been paid. Preparation and packing may begin.',
         jsonb_build_object('receipt_id', p_receipt_id, 'supplier_id', su.supplier_id)
  FROM public.supplier_users su
  WHERE su.active
    AND EXISTS (
      SELECT 1 FROM public.sales_order_lines l
      WHERE l.sales_order_id = v_order_id AND l.supplier_id = su.supplier_id
    )
  ON CONFLICT DO NOTHING;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Initial configuration seeds and grants
-- -----------------------------------------------------------------------------
INSERT INTO public.payment_configuration_versions (configuration_code, version_number, status, qr_storage_path, instructions)
VALUES ('freshgo_manual_qr', 1, 'draft', NULL, NULL)
ON CONFLICT (configuration_code, version_number) DO NOTHING;

WITH inserted AS (
  INSERT INTO public.delivery_method_versions (method_code, version_number, status, active, fee_amount, external_provider, external_booking_url, customer_pays_external_provider)
  VALUES
    ('instant_customer_lalamove', 1, 'draft', true, 0, 'Lalamove', NULL, true),
    ('normal_bulk', 1, 'draft', true, 2, NULL, NULL, false)
  ON CONFLICT (method_code, version_number) DO NOTHING
  RETURNING id, method_code
)
INSERT INTO public.delivery_method_version_days (delivery_method_version_id, weekday)
SELECT id, day_value
FROM inserted CROSS JOIN LATERAL (
  VALUES
    ('instant_customer_lalamove', 2), ('instant_customer_lalamove', 3), ('instant_customer_lalamove', 4), ('instant_customer_lalamove', 5),
    ('normal_bulk', 3), ('normal_bulk', 5)
) AS days(method_code, day_value)
WHERE days.method_code = inserted.method_code
ON CONFLICT DO NOTHING;

INSERT INTO public.delivery_method_version_windows (delivery_method_version_id, start_time, end_time)
SELECT id, CASE WHEN method_code = 'instant_customer_lalamove' THEN time '09:00' ELSE time '18:30' END,
       CASE WHEN method_code = 'instant_customer_lalamove' THEN time '16:00' ELSE time '21:00' END
FROM public.delivery_method_versions WHERE version_number = 1
ON CONFLICT DO NOTHING;

INSERT INTO public.delivery_method_version_zones (delivery_method_version_id, zone_code, zone_name)
SELECT v.id, lower(replace(residence, ' ', '_')), residence
FROM public.delivery_method_versions v
CROSS JOIN (VALUES
  ('Residensi Rimbun'), ('Residensi Mutiara'), ('Residensi Emas'), ('Residensi Jed'), ('Residensi Parkland'), ('Residensi Zamrud')
) AS residences(residence)
WHERE v.method_code = 'normal_bulk' AND v.version_number = 1
ON CONFLICT DO NOTHING;

UPDATE public.delivery_method_versions
   SET status = 'published', published_at = now()
 WHERE version_number = 1 AND status = 'draft';

INSERT INTO public.payment_reminder_rules (rule_code, enabled, first_delay_minutes, repeat_interval_minutes, maximum_reminders)
VALUES ('default_final_price_payment', true, 1440, 1440, 3)
ON CONFLICT (rule_code) DO NOTHING;

GRANT EXECUTE ON FUNCTION public.finalize_sales_order_pricing(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_sales_order_payment_receipt(uuid, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_sales_order_payment_receipt(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_sales_order_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4a_assert_supplier_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_supplier_for_sales_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_payment_configuration_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_delivery_method_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retire_payment_configuration_version(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retire_delivery_method_version(uuid, timestamptz) TO authenticated;
