/*
# Create customer_profiles table

## Summary
Adds a delivery profile store for authenticated customers. When a customer
completes checkout, their name, phone, and address details are saved here.
On future checkouts, these values are pre-populated in the form so the
customer does not have to re-enter them.

## New Table: customer_profiles
Keyed on the auth user's UUID (one row per customer account).

### Columns
- `id`          — uuid, primary key, FK → auth.users(id), CASCADE on delete.
                  Matches auth.uid() so no separate user_id column is needed.
- `full_name`   — customer's full name (text, default '')
- `phone`       — Malaysian phone number (text, default '')
- `address`     — full street / unit / apartment address line (text, default '')
- `postcode`    — 5-digit postcode (text, default '')
- `city`        — city name (text, default '')
- `state`       — Malaysian state (text, default 'Selangor')
- `updated_at`  — timestamp of the last update (timestamptz, default now())

## Security
- RLS enabled.
- Authenticated users can SELECT, INSERT, UPDATE their own row only
  (using auth.uid() = id).
- No DELETE policy — profiles should persist unless the account is deleted
  (handled by CASCADE on the FK).

## Notes
1. Email is intentionally excluded — it already lives in auth.users and must
   not be duplicated here.
2. Defaults are empty strings so an upsert with partial data is safe.
3. This table is separate from supplier_profiles, which stores vendor linkage
   for suppliers. customer_profiles stores delivery preferences only.
4. INSERT is needed in addition to UPDATE because the first time a customer
   places an order there is no existing row to update.
*/

CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text        NOT NULL DEFAULT '',
  phone       text        NOT NULL DEFAULT '',
  address     text        NOT NULL DEFAULT '',
  postcode    text        NOT NULL DEFAULT '',
  city        text        NOT NULL DEFAULT '',
  state       text        NOT NULL DEFAULT 'Selangor',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON public.customer_profiles;
CREATE POLICY "select_own_profile" ON public.customer_profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON public.customer_profiles;
CREATE POLICY "insert_own_profile" ON public.customer_profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON public.customer_profiles;
CREATE POLICY "update_own_profile" ON public.customer_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
