# Migration ledger assumptions

Phase 0 treats the schema-only FreshGo Test dump as the deployed-schema source
of truth and this repository as the source of **future** migrations. It does
not rewrite, delete, or infer entries already recorded in
`supabase_migrations.schema_migrations`.

## Release procedure

Before applying a release, an operator must export the Test and production
migration ledgers and compare their `version` values to the repository's
top-level `supabase/migrations/*.sql` files. Keep that export with the release
record. A missing, extra, or checksum-conflicting entry is a stop condition;
do not use `repair` to make the ledger look clean without first reconciling the
actual schema.

The branch intentionally contains no project reference or credentials. All
test writes must use the dedicated Test project described in `docs/testing.md`.

## Historical duplicate timestamp

The three former `20260822000000_*` pricing patches were manually applied
corrective history, not a reliable three-entry migration ledger. The final
V2.2.2 patch remains in migration discovery because it declares compatibility
with the preceding corrections. Its predecessors are retained verbatim under
`supabase/legacy-manual-migrations/` for audit only and must not be replayed by
migration tooling.

For an environment with `20260822000000` already recorded, verify the final
pricing functions and indexes against the Test schema before a future pricing
change. Do not rename a recorded version or attempt to replay the legacy
patches.

## Phase 0 compatibility migration

`20260902000000_add_customer_profile_checkout_fields.sql` is additive and
idempotent. It supplies `customer_profiles.email_address` and
`customer_profiles.notes`, which CheckoutPage reads and writes. It does not
backfill profiles, touch Orders, or change RLS policy scope.
