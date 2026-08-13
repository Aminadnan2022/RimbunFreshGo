/*
  Removes the temporary R4 runtime diagnostic trigger from public."Orders".

  trg_00_r4_debug_runtime raises P0001 with R4_DEBUG context on every UPDATE,
  which blocks legitimate supplier weight saves before the intended R4 guards
  can complete. It was created directly in the database and is not part of the
  tracked schema or bootstrap SQL. This migration intentionally removes only
  that trigger: supplier allowlist/payment/freeze/write-once guards, RLS, and
  SECURITY DEFINER workflow RPCs are unchanged.
*/

DROP TRIGGER IF EXISTS trg_00_r4_debug_runtime ON public."Orders";
