# Phase 1 database foundations

Phase 1 is additive only. It leaves `Product`, `combos`, `combo_items`,
`selling_price_history`, `supplier_price_history`, `suppliers`, `"Orders"`,
reporting views and delivery workflow untouched. Checkout continues to write
the legacy `"Orders"` JSONB structure until a later, separately approved
cutover.

## Migration order

1. `20260903000000_phase1_versioned_catalog_and_preparation.sql`
2. `20260903000001_phase1_immutable_order_snapshots.sql`

Apply them only after Phase 0's
`20260902000000_add_customer_profile_checkout_fields.sql`, and only after the
Test migration ledger and schema have been reconciled as described in
`migration-ledger.md`.

## Versioned master data

- `product_versions` versions unit/quantity rules, product configuration and
  the assigned preparation-schema version. It references the stable legacy
  `Product.id`; it does not replace that table.
- Existing `selling_price_history` and `supplier_price_history` remain the
  single price/cost history. `get_effective_product_configuration` joins the
  versioned configuration to those histories at an explicit timestamp.
- `preparation_schemas`, versions, questions and options make the checkout
  questionnaire configurable. A question declares whether its answer belongs
  to the full line or each physical unit.
- `combo_versions` and `combo_version_items` provide future dated combo price
  and composition without changing legacy combo tables.

Published product, preparation-schema and combo versions use half-open ranges:
`effective_from <= timestamp < effective_to`; a null end is open-ended.
Triggers take a per-entity advisory transaction lock and reject overlapping
published ranges. Published versions, questions and options cannot be changed
or deleted; publish a replacement version instead.

## Immutable transaction facts

`sales_orders`, lines, units and preparation answers are normalized snapshots.
They retain master-version references plus JSON display snapshots and numeric
commercial facts. Per-unit rows support one persisted preparation selection per
physical chicken/fish. Updates and deletes raise an exception; operational
changes belong in append-only `sales_order_events`, while monetary corrections
belong in `sales_order_adjustments`.

The optional `legacy_order_id` link uses `ON DELETE SET NULL`, so an accidental
legacy-order deletion cannot cascade into the new audit record.

## Security

All Phase 1 tables have RLS enabled. Published catalog/preparation information
is readable by storefront roles. Admins can manage draft/version rows. Snapshot
tables expose customer-owned orders (and admins) for SELECT only; they grant no
browser INSERT/UPDATE/DELETE route. A later server-side checkout RPC will be
the sole writer after its authoritative pricing and final-weighing policy has
been approved.

## Decisions required before Phase 2

- Confirm the business timezone and the exact instant an order becomes
  confirmed/immutable.
- Decide whether final weight can change the settlement total, and which event
  creates the adjustment.
- Confirm who can publish configuration versions and schedule future changes.
- Define supplier allocation before supplier-level snapshot visibility is
  granted.
- Approve the server-side order-creation contract and how legacy Orders are
  dual-written/backfilled during cutover.
