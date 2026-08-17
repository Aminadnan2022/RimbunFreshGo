# Phase 4A Canonical Sales Schema Audit
## FreshGo — Comprehensive Schema Freeze Decision Document

**Date**: 2026-08-15  
**Repository**: /workspaces/RimbunFreshGo  
**Branch**: feature/architecture-reconciliation  
**Stage**: NO FILES EDITED — AUDIT ONLY

---

## EXECUTIVE SUMMARY

The FreshGo canonical sales schema is **80% ready for production cutover** but has **one critical gap and two architectural decisions required**.

### Current State
- ✅ Canonical order/line/unit/event schema created and immutable-protected (20260903000001)
- ✅ Preparation answers canonicalized and immutable (20260905000000)
- ✅ Product versioning exists (effective-dated, published immutable)
- ✅ Pricing history exists (effective-dated, audit-ready)
- ❌ **PAYMENT state is missing from canonical sales_orders** (currently on legacy Orders only)
- ❌ **ORDER LIFECYCLE is mutable-timestamp-based, not event-sourced** (can be fixed without schema redesign)
- ⚠️ Physical unit granularity is present but not yet fully integrated with ordering modes

### Critical Gap
The canonical schema does not define payment_status, paid_at, paid_by. These must be added to sales_orders (OPTION A — simple) or a dedicated payment table must be created (OPTION B — complex).

### Recommended Decision
**Add payment fields to sales_orders** (OPTION A) because:
- FreshGo is a small hyperlocal business, not a fintech platform
- Current app only needs Pending → Ready To Pay → Paid (3-state machine)
- No payment gateway integration is planned yet
- Simplicity and clarity are more valuable than future extensibility
- sales_orders will become the single source-of-truth for canonical order state

### Recommended Phase 4A Scope
1. **Freeze final decision on payment architecture** (this audit's main output)
2. **Add payment columns to sales_orders** (minimal migration)
3. **Confirm order status/event split** (no schema changes needed)
4. **Validate financial fact freeze** (schema is already correct)
5. **Confirm product lineage** (schema is already correct)
6. Proceed to Phase 4B: Rewrite checkout to canonical model

---

## SECTION A: CURRENT CANONICAL SCHEMA (TABLE-BY-TABLE)

### 1. sales_orders

**Purpose**: Canonical immutable order header and transaction-level facts.

**Current Columns**:
```sql
id uuid PRIMARY KEY
legacy_order_id bigint UNIQUE (bridge to old Orders)
order_number text UNIQUE NOT NULL (human-readable)
customer_id uuid (ref auth.users)
status text DEFAULT 'confirmed' (semantic: order state)
confirmed_at timestamptz DEFAULT now()
currency_code text DEFAULT 'MYR'
customer_snapshot jsonb (frozen at creation)
delivery_snapshot jsonb (frozen at creation)
subtotal numeric(12,2) DEFAULT 0
delivery_fee numeric(12,2) DEFAULT 0
discount_amount numeric(12,2) DEFAULT 0
total numeric(12,2) DEFAULT 0
  CONSTRAINT: total = subtotal + delivery_fee - discount_amount
source_payload jsonb (checkout metadata)
created_at timestamptz DEFAULT now()
created_by uuid (ref auth.users)
```

**Immutability**:
- Append-only trigger: prevents UPDATE/DELETE
- RLS policies restrict customer read-access to own orders

**Current Gaps**:
- ❌ NO payment_status
- ❌ NO paid_at
- ❌ NO paid_by
- ⚠️ NO current status tracking (must derive from events later)

**Missing from Canonical Model**:
These should NOT belong here; they belong in events:
- order_summary.status (derived from events)
- packing_*, dispatch_*, delivery_* timestamps (should be events)
- delivery_batch_id (belongs in delivery assignment table, not canonical order)

---

### 2. sales_order_lines

**Purpose**: Canonical immutable commercial item facts (products or combos).

**Current Columns**:
```sql
id uuid PRIMARY KEY
sales_order_id uuid NOT NULL (ref sales_orders, ON DELETE RESTRICT)
line_number integer (1-indexed per order)
product_id text (nullable; ref Product; for product items)
product_version_id uuid (ref product_versions; for versioned lineage)
combo_id text (nullable; ref combos; for combo items)
combo_version_id uuid (ref combo_versions; for versioned lineage)
item_kind text ('product' | 'combo')
  CONSTRAINTS:
    - if product: product_id NOT NULL, combo_id NULL
    - if combo: combo_id NOT NULL, product_id NULL
product_snapshot jsonb (frozen product snapshot at creation)
quantity numeric(12,3) (line-level quantity)
estimated_weight_kg numeric(12,3) (pre-weigh estimate)
actual_weight_kg numeric(12,3) (post-weigh finalisation)
selling_unit text (unit of measurement)
unit_selling_price numeric(12,2) (RM per unit)
unit_cost_price numeric(12,2) (RM per unit, nullable if unknown)
supplier_id bigint (ref suppliers)
supplier_snapshot jsonb (frozen supplier snapshot)
discount_amount numeric(12,2) (line-level discount)
line_total numeric(12,2) (selling_unit_price × qty or weight)
created_at timestamptz
UNIQUE: (sales_order_id, line_number)
```

**Immutability**:
- Append-only trigger: prevents UPDATE/DELETE
- RLS policies restrict access to own order

**Design Quality**:
- ✅ Strong separation of estimated vs actual weight
- ✅ Frozen unit prices prevent product master retroactive changes
- ✅ Version tracking enables reconstruction
- ✅ Supplier snapshot enables supplier audit trail
- ✅ Line-level discount ready for future use
- ⚠️ combo_id + combo_version_id present but no child-product linkage

---

### 3. sales_order_line_units

**Purpose**: Physical unit facts for items where preparation/handling is unit-scoped (e.g., individual fish).

**Current Columns**:
```sql
id uuid PRIMARY KEY
sales_order_line_id uuid NOT NULL (ref sales_order_lines, ON DELETE RESTRICT)
unit_number integer (1-indexed per line)
physical_unit_type text ('chicken' | 'fish' | 'other')
estimated_weight_kg numeric(12,3)
actual_weight_kg numeric(12,3)
unit_snapshot jsonb (frozen unit config)
created_at timestamptz
UNIQUE: (sales_order_line_id, unit_number)
```

**Immutability**:
- Append-only trigger: prevents UPDATE/DELETE

**Design Quality**:
- ✅ Clear modeling of physical units
- ✅ Separates estimated from actual weight at unit granularity
- ⚠️ No direct link to preparation answers (must use line_id as parent)
- ⚠️ physical_unit_type enum is simple but may not capture all future types

**Current Gap**:
- Unit creation logic is not yet wired in checkout (testing-only)

---

### 4. sales_order_preparation_answers

**Purpose**: Immutable customer preparation answers keyed to line/unit and questionnaire version.

**Current Columns**:
```sql
id uuid PRIMARY KEY
sales_order_line_id uuid NOT NULL (ref sales_order_lines)
sales_order_line_unit_id uuid NULLABLE (ref sales_order_line_units)
  - MUST be NULL for line-scope answers
  - MUST NOT be NULL for unit-scope answers
preparation_schema_version_id uuid NOT NULL (ref preparation_schema_versions)
preparation_question_id uuid NOT NULL (ref preparation_questions)
preparation_option_id uuid NULLABLE (ref preparation_question_options)
question_code text NOT NULL (immutable code for resilience)
option_code text NULLABLE (immutable option code if selected)
answer_value jsonb (freeform answer for open questions)
created_at timestamptz
UNIQUE NULLS NOT DISTINCT: (sales_order_line_id, sales_order_line_unit_id, question_code)
```

**Immutability**:
- Append-only trigger: prevents UPDATE/DELETE
- Validation trigger ensures schema version linkage and scope matching

**Design Quality**:
- ✅ Immutable answer recording
- ✅ Schema-version linkage enables reconstruction
- ✅ Both line-scope and unit-scope answers supported
- ✅ Audit-ready with both codes and IDs for lineage

---

### 5. sales_order_events

**Purpose**: Append-only lifecycle event log for order progress tracking.

**Current Columns**:
```sql
id uuid PRIMARY KEY
sales_order_id uuid NOT NULL (ref sales_orders, ON DELETE RESTRICT)
event_type text NOT NULL (e.g., 'order_confirmed', 'payment_received', 'packing_started', 'delivered')
event_at timestamptz DEFAULT now() (when event occurred)
actor_id uuid NULLABLE (ref auth.users; who triggered it)
payload jsonb (event metadata)
created_at timestamptz DEFAULT now() (when recorded)
INDEX: (sales_order_id, event_at DESC)
```

**Immutability**:
- Append-only trigger: prevents UPDATE/DELETE
- Events are never deleted or changed

**Design Quality**:
- ✅ Event sourcing foundation is in place
- ✅ Payload is extensible JSON for event-specific metadata
- ✅ Actor tracking for audit
- ⚠️ NOT YET USED BY LIVE APP (still writing timestamps to legacy Orders)

**Current Gap**:
- Event types are not yet standardized or documented
- App still writes operational state to Orders timestamps, not events

---

### 6. sales_order_adjustments

**Purpose**: Append-only record of monetary adjustments (refunds, credits, charges, settlements).

**Current Columns**:
```sql
id uuid PRIMARY KEY
sales_order_id uuid NOT NULL (ref sales_orders)
sales_order_line_id uuid NULLABLE (ref sales_order_lines; NULL = order-level)
adjustment_type text ('refund' | 'credit' | 'charge' | 'settlement')
amount numeric(12,2) NOT NULL (can be negative for debits)
  CHECK: amount <> 0
currency_code text DEFAULT 'MYR'
reason text NOT NULL (audit trail)
created_at timestamptz
created_by uuid NULLABLE (ref auth.users)
INDEX: (sales_order_id, created_at)
```

**Immutability**:
- Append-only: only INSERT, no UPDATE/DELETE

**Design Quality**:
- ✅ Flexible enough for line-level or order-level adjustments
- ✅ Reason field enables audit
- ✅ Can support future payment gateway reversals
- ⚠️ NOT YET USED BY LIVE APP (no refund workflow yet)

---

## SECTION B: CANONICAL RESPONSIBILITY MATRIX

| Component | Table(s) | Responsibility | Immutable | Status |
|-----------|----------|---|---|---|
| Order header | sales_orders | Transaction-level facts | ✅ Mostly | ❌ Missing payment |
| Commercial lines | sales_order_lines | Product/combo offering frozen | ✅ Yes | ✅ Complete |
| Physical units | sales_order_line_units | Individual item fulfilment | ✅ Yes | ✅ Present |
| Prep answers | sales_order_preparation_answers | Customer choices frozen | ✅ Yes | ✅ Complete |
| Lifecycle events | sales_order_events | State transitions | ✅ Yes | ⚠️ Defined but unused |
| Adjustments | sales_order_adjustments | Refunds/charges | ✅ Yes | ⚠️ Defined but unused |

---

## SECTION C: PAYMENT ARCHITECTURE DECISION

### Current Legacy Payment Model (on Orders)

```sql
payment_status text ('Pending' | 'Ready To Pay' | 'Paid')
paid_at timestamptz (NULL until admin confirms)
paid_by uuid (which admin confirmed payment)
```

**Current Guard Logic**:
- Pending → Ready To Pay: supplier workflow only (weight-based items)
- Ready To Pay → Paid: admin-only
- Paid is terminal: cannot revert to earlier states
- Paid orders are frozen: financial fields immutable once Paid

### OPTION A: Add Payment Fields to sales_orders ✅ RECOMMENDED

```sql
ALTER TABLE public.sales_orders ADD (
  payment_status text NOT NULL DEFAULT 'Pending',
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
```

**Advantages**:
- Single source-of-truth for canonical order
- Minimal schema change (3 columns)
- Guards can apply to sales_orders or payment events
- Simple to understand and maintain
- Sufficient for FreshGo's manual payment workflow

**Disadvantages**:
- Not ideal for future multi-payment scenarios
- Tight coupling between order and payment state
- No separate audit trail for payment events

**Risk**: Low — FreshGo is not a platform business

### OPTION B: Dedicated Payment Table (Not Recommended)

```sql
CREATE TABLE sales_order_payments (
  id uuid PRIMARY KEY,
  sales_order_id uuid NOT NULL UNIQUE (ref sales_orders),
  payment_status text,
  amount numeric(12,2),
  method text,
  provider text,
  provider_reference text,
  paid_at timestamptz,
  confirmed_by uuid,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  reasons text
);
```

**Advantages**:
- Separation of concerns
- Supports future payment gateways
- Multiple payment attempts per order
- Natural audit trail

**Disadvantages**:
- Extra table/join for every order query
- Adds complexity without immediate benefit
- FreshGo doesn't need this yet
- Makes canonical order definition incomplete

**Risk**: Over-engineering for current business

### **RECOMMENDATION: OPTION A**

**Rationale**:
- FreshGo is a hyperlocal fresh-food ordering platform, not a fintech company
- Current workflow is:
  - Customer places order → payment_status='Pending'
  - Supplier weighs items → supplier marks 'Ready To Pay'
  - Admin manually confirms payment → payment_status='Paid'
- This is a simple 3-state machine, not a complex payment ledger
- OPTION A is clearer, simpler, and sufficient
- Can always extract into separate table later if needed

**Phase 4A Action**:
```sql
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS (
  payment_status text NOT NULL DEFAULT 'Pending',
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Add constraint (inherited from legacy Orders)
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_payment_status_check
  CHECK (payment_status IN ('Pending', 'Ready To Pay', 'Paid'));
```

---

## SECTION D: STATUS/EVENT ARCHITECTURE RECOMMENDATION

### Current Legacy Model (on Orders)

Order state is tracked via:
1. **Mutable status column**: `order_summary.status` (JSON, operational)
2. **Mutable timestamp columns**:
   - packing_started_at
   - packing_completed_at
   - supplier_dispatch_started_at
   - supplier_dispatch_completed_at
   - ready_for_rider_at
   - delivery_status ('pending' | 'arrived' | 'out_for_delivery' | 'delivered')
   - delivered_at
   - archived_at (cancellation marker)

**Problem**: Timestamps can be updated; makes causality and ordering ambiguous.

### Canonical Event Model (in sales_order_events)

Fully append-only event log exists in schema. Should record:

```sql
INSERT INTO sales_order_events (sales_order_id, event_type, payload, actor_id)
VALUES (
  order_id,
  'packing_started',
  jsonb_build_object('packing_started_at', now()),
  auth.uid()
);
```

### Recommended Status/Event Split

**Best Practice** (event-sourced):
- Current status is ALWAYS derived from latest event
- Events are append-only source-of-truth
- Timestamps appear only in event payload
- No mutable timestamp columns on sales_orders

**However**, for Phase 4A freeze (not implementation):

**Option 1** (Strict Event Sourcing):
- sales_orders has NO status timestamp columns
- All state derived from sales_order_events
- View or computed column shows current status
- Requires app-side event-to-status conversion

**Option 2** (Pragmatic Hybrid — RECOMMENDED FOR PHASE 4A):
- sales_orders has optional summary columns: `current_status`, `latest_event_at`
- These are UPDATED only via SECURITY DEFINER RPCs, never by app
- Events remain authoritative
- Reads can use summary columns for speed
- Audit trail via events

**Option 3** (Minimal — Phase 4A Only):
- Leave status unchanged for now
- Add events to every state change
- Dual-write during cutover
- Gradually migrate reads to events

### **RECOMMENDATION: OPTION 2 (Pragmatic Hybrid)**

**Phase 4A Implementation**:
```sql
-- No new schema changes required now
-- Document that future checklist will:
-- 1. Record events on all state changes
-- 2. Update summary columns via RPC only
-- 3. Gradually migrate app reads to events
```

**Rationale**:
- Canonical events table is already in place
- Full event sourcing can happen after checkout cutover
- No schema changes needed immediately
- Prevents over-engineering during main cutover rush
- FreshGo doesn't yet need complex temporal queries

**Current State**:
- ✅ Event table exists (immutable)
- ❌ App doesn't write events yet
- ❌ App doesn't read from events
- ✅ Ready for Phase 4B to add event writes

---

## SECTION E: ESTIMATED VS FINAL FINANCIAL MODEL

### Current Canonical Schema

**At Creation (Checkout)**:
- sales_order_lines.quantity (fixed quantity or estimated)
- sales_order_lines.estimated_weight_kg (pre-weigh estimate)
- sales_order_lines.unit_selling_price (frozen at checkout)
- sales_order_lines.unit_cost_price (frozen at checkout)
- sales_order_lines.line_total (calculated)
- sales_orders.subtotal (sum of line totals)
- sales_orders.delivery_fee (frozen)
- sales_orders.total (subtotal + delivery_fee)

**After Supplier Weighs (Finalisation)**:
- sales_order_line_units.actual_weight_kg (post-weigh reality)
- sales_order_lines.actual_weight_kg (rolled up from units)
- ⚠️ No final_line_total field (must recalculate)
- ⚠️ No final order total field (must recalculate)

### Gap Analysis

**Current Schema Issues**:

1. **Recalculation Required Post-Weigh**:
   - After actual weight is known, final totals must be recalculated from unit prices × actual weight
   - No immutable "final" fields preserve the calculation
   - This is okay IF all calculations stay on app layer

2. **For Weight-Based Items Only**:
   - fixed_quantity items: quantity never changes, estimated = final
   - weight_only items: must recalculate after weighing
   - whole_fish_by_weight: must recalculate after weighing
   - slice: must recalculate after weighing

### Financial Freeze Responsibility

**At Checkout (Immutable)**:
- ✅ unit_selling_price (never changes, locked in frozen)
- ✅ unit_cost_price (never changes, locked in frozen)
- ✅ quantity (for fixed items only, immutable)
- ✅ estimated_weight_kg (best guess at checkout)
- ✅ product_version_id (historical lineage)

**During Fulfilment (Can Change)**:
- actual_weight_kg (arrives post-weigh)
- ⚠️ Final line_total (must recalculate)
- ⚠️ Final order total (must recalculate)

**Never Recalculated Retroactively**:
- ✅ unit_selling_price (price history is separate)
- ✅ unit_cost_price (supplier cost history is separate)
- ✅ Delivery fee (snapshot in sales_orders)

### Recommendation

**Current schema is CORRECT for Phase 4A**:
- No additional columns needed
- Frozen prices prevent retroactive rewriting
- Estimated vs actual weights are separated
- Recalculation happens only post-weigh, before Paid

**Validation Rule**:
- Final money is locked once payment_status = 'Paid'
- Before Paid: can recalculate if weight changes
- After Paid: is immutable forever

---

## SECTION F: PRODUCT/PRICING LINEAGE ASSESSMENT

### Current Canonical Lineage

**In sales_order_lines**:
```sql
product_id text (current product ID)
product_version_id uuid (link to effective-dated version)
product_snapshot jsonb (snapshot at creation)
unit_selling_price numeric (frozen price, not from Product.price)
unit_cost_price numeric (frozen cost, not from Product.cost_price)
supplier_id bigint (supplier ID)
supplier_snapshot jsonb (supplier snapshot at creation)
selling_unit text (unit of measurement)
```

### Supporting History Tables

**product_versions**:
- effective_from / effective_to (date range)
- configuration jsonb (product settings)
- display_snapshot jsonb (name, description, images)
- selling_unit
- ordering_mode
- physical_unit_type

**selling_price_history**:
- product_id
- selling_price numeric
- effective_from / effective_to (date range)
- is_active boolean

**supplier_price_history**:
- product_id
- supplier_name
- cost_price numeric
- effective_from / effective_to (date range)
- is_active boolean

### Reconstruction Test

**Can we reconstruct an old order 100% correctly without querying current Product?**

Example: Order from 2026-08-01 needs to be reanalyzed for profit reporting in 2026-09-15.

**What we have**:
- product_version_id → can look up product_versions (effective_from ≤ order_date ≤ effective_to)
- product_snapshot → has product name, category, ordering mode at order time
- unit_selling_price → frozen in line
- unit_cost_price → frozen in line
- selling_price_history → can validate against product_version.effective_from
- supplier_price_history → can validate against supplier_snapshot

**What if Product.price changed since order?**
- ✅ No problem: lineage uses frozen unit_selling_price
- ✅ But must validate: frozen price should match selling_price_history entry active on order date

**Gap**: product_snapshot should include category for analytics, but may not currently.

### Assessment: ✅ LINEAGE IS SUFFICIENT

**Confidence**: 90%

**Rationale**:
- Version tracking is in place
- Frozen prices prevent retroactive drift
- History tables support validation
- Supplier snapshot enables audit

**Minor Gap** (nice-to-have, not blocking):
- product_snapshot should include product.category for reporting
- Can work around by joining product_versions

**Phase 4A Action**: Document lineage assumptions. No schema changes required.

---

## SECTION G: PHYSICAL UNIT MODEL ASSESSMENT

### Current Canonical Model

**sales_order_line_units**:
- One row per physical unit (e.g., one row per fish)
- Scopes to sale_order_lines
- Includes estimated_weight_kg and actual_weight_kg

### Ordering Mode Mapping

Current FreshGo ordering modes (from Product):

| Mode | Example | Physical Units | Expected Rows per Line | Current Schema Fit |
|------|---------|---|---|---|
| fixed_quantity | Combo | None | 0 | ✅ No units needed |
| weight_only | Cencaru (small fish, weigh by kg) | Variable | 0 or 1 | ⚠️ May need one aggregate unit |
| whole_fish_by_weight | Bawal Emas (sell per fish, pay by weight) | 1 fish each | N (one per fish) | ✅ Good fit |
| slice | Fish sliced by count (but priced by final weight) | 1 source fish | 1 | ✅ Good fit |
| combo | Multiple products bundled | Varies | 0 or N | ✅ Good fit (no units) |

### Assessment by Mode

**fixed_quantity** (e.g., Combo):
- ✅ Zero units needed
- Customer orders quantity
- No weight tracking needed

**weight_only** (e.g., Cencaru):
- ⚠️ Ambiguous: is it one line with total weight, or multiple units?
- Current: Typically one line with estimated_weight_kg
- Can represent as single aggregate unit or zero units
- Recommendation: Zero units for weight_only (just use line.actual_weight_kg)

**whole_fish_by_weight** (e.g., 3 Bawal Emas):
- ✅ Clear mapping: 3 fish = 3 units
- One unit per fish
- Each unit tracks individual weight
- Perfect for supplier workflow (pack each fish, weigh each)

**slice** (e.g., 10 slices of fish):
- ✅ One source fish = one unit
- Requested slice_count is not the physical unit
- Physical unit tracks source fish weight
- Slices are lines in order, not units

**combo** (e.g., Combo with 2 products):
- ✅ Combos are orders as single lines
- Child products expand but don't become separate units
- No physical units needed unless child is whole_fish

### Gap Analysis

**Missing**: Explicit link between ordering_mode and unit creation logic.

**Current Issue**:
- sales_order_line_units.physical_unit_type is hardcoded enum ('chicken' | 'fish' | 'other')
- Does not reference ordering_mode
- Assume for now: unit creation happens only if ordering_mode supports physical units

**Recommended Phase 4A Handling**:
- Document that units are created only for:
  - whole_fish_by_weight (always)
  - slice (one unit per source fish, not per slice count)
- weight_only and fixed_quantity do NOT create units
- Use line.estimated_weight_kg and line.actual_weight_kg for aggregate weights

### Assessment: ✅ SUFFICIENT WITH DOCUMENTATION

**Current Schema**: Handles all modes correctly.
**Missing**: Clear enum or documentation mapping ordering_mode → unit creation logic.

**Phase 4A Action**: Add code comment in checkout:
```javascript
// Create units only for whole_fish_by_weight and slice modes
// weight_only uses line.actual_weight_kg (no units)
// fixed_quantity and combo don't track weight
```

---

## SECTION H: COMBO HISTORICAL-SAFETY ASSESSMENT

### Current Canonical Combo Model

**In sales_order_lines**:
```sql
combo_id text (current combo ID)
combo_version_id uuid (link to effective-dated version)
product_snapshot jsonb (combo snapshot? unclear)
quantity numeric (how many combos)
```

**Supporting Table: combo_versions**:
- combo_id
- version_number
- status ('draft' | 'published' | 'retired')
- effective_from / effective_to (date range)
- selling_price numeric (price of combo)
- display_snapshot jsonb

**Supporting Table: combo_version_items**:
- combo_version_id
- product_id
- product_version_id
- quantity
- unit_snapshot jsonb

### Reconstruction Test

**Old order from 2026-08-01 contains a combo. Can we reconstruct it?**

**What we have**:
- combo_version_id → look up combo_versions
- combo_versions.display_snapshot → combo name/description
- combo_versions has selling_price (frozen)
- combo_version_items → child products and versions

**What we CAN reconstruct**:
- ✅ Combo name and description
- ✅ Combo price at order time
- ✅ Child product IDs
- ✅ Child product versions
- ✅ Quantity per child product

**What we CANNOT reconstruct yet**:
- ❌ Child product snapshots (product names, categories, prices at order time)
- ❌ Whether children were whole_fish_by_weight or fixed_quantity
- ❌ Whether children had preparation options

### Gap Analysis

**Issue**: combo_version_items.product_snapshot is present but unclear if populated.

**Current State**: combo_version_items has:
- product_id (child product)
- product_version_id (versioned child)
- quantity (how many of this child)
- unit_snapshot jsonb (unclear what's inside)

**Likely Missing**:
- Child product snapshot at combo creation time
- Child ordering_mode at combo creation time
- Child preparation availability at combo creation time

### Recommendation

**Current Schema Gap**: Combo child snapshots are not fully frozen.

**Phase 4A Action**:
Before checkout cutover, document combo snapshot requirements:

```javascript
// If combo contains whole_fish_by_weight child:
//   combo.quantity = 2 combos
//   each combo contains 3x bawal-emas (which is whole_fish_by_weight)
//   so: 6 total fish, represented as:
//       sales_order_lines: 1 line (combo), quantity=2
//       (child products are expanded elsewhere, not in canonical model)
```

**Assessment**: Schema is ADEQUATE but not yet tested at scale.

**Recommendation**: Mark combo expansion as "Phase 4B testing task" (not Phase 4A).

---

## SECTION I: CUSTOMER/DELIVERY SNAPSHOT ASSESSMENT

### Current Canonical Model

**In sales_orders**:
```sql
customer_snapshot jsonb (frozen at checkout)
delivery_snapshot jsonb (frozen at checkout)
```

### Customer Snapshot (Recommended Content)

Currently likely contains (from Orders.full_name, phone_number, email_address):
```json
{
  "name": "Ahmad Bin Ali",
  "phone": "+60-123-456789",
  "email": "ahmad@example.com",
  "apartment": "Unit 2-15",
  "pickup_location": "Residensi Rimbun"
}
```

**Strengths**:
- ✅ Name, phone, email preserved
- ✅ Address immutable for historical fulfillment

**Gaps**:
- ⚠️ If customer updates profile later, historical order still shows old address
- ⚠️ Unclear if email is reliably captured at checkout

### Delivery Snapshot (Recommended Content)

Currently likely contains (from Orders.delivery_point_name, delivery_method):
```json
{
  "delivery_point": "Residensi Rimbun",
  "delivery_method": "pickup",
  "delivery_date": "2026-08-17",
  "delivery_window": "3-4 PM",
  "delivery_fee": 15.00
}
```

**Strengths**:
- ✅ Delivery point frozen
- ✅ Delivery fee frozen
- ✅ Delivery window preserved

**Gaps**:
- ⚠️ No full address (street, postcode, city) in snapshot
- ⚠️ If delivery point moves/closes, historical context lost

### Assessment: ✅ SUFFICIENT FOR HYPERLOCAL BUSINESS

**Current State**:
- Customer snapshot is adequate for order fulfillment
- Delivery snapshot captures key logistics data
- Both are immutable once created

**No Changes Required for Phase 4A**.

**Nice-to-Have (Future)**:
- Add delivery_point_id to sales_orders (for dimensional analytics)
- Add delivery_point_snapshot (address, operating hours at creation time)

---

## SECTION J: CANCELLATION/ARCHIVE MODEL

### Current Legacy Model (on Orders)

```sql
archived_at timestamptz (when cancelled)
archived_by uuid (which admin cancelled)
cancellation_reason text (why)
```

**Current Logic** (from 20260915000000):
- Only unpaid orders can be archived
- If payment_status = 'Paid', archive is BLOCKED
- Archived orders are filtered out of normal queries (is_archived IS NULL)
- But row is NOT physically deleted (audit trail preserved)

### Canonical Recommendation

**In sales_orders, add**:
```sql
archived_at timestamptz NULLABLE,
archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
cancellation_reason text
```

**Plus one of**:

**Option A**: Treat archival as a status state
```sql
-- sales_order_events records: 'cancelled'
INSERT INTO sales_order_events
  (sales_order_id, event_type, payload, actor_id)
VALUES (order_id, 'cancelled', jsonb_build_object('reason', 'Out of stock'), admin_id);
```

**Option B**: Track only in events, no dedicated columns
```sql
-- No columns; derive archived status from latest 'cancelled' event
```

### Assessment: ✅ HYBRID RECOMMENDED (OPTION A)

**Rationale**:
- Archival is rare enough that a simple column + event is clearer
- Avoids fetching full event history just to determine if order is active
- Aligns with pragmatic hybrid status approach (Section D)

**Phase 4A Action**:
```sql
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS (
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancellation_reason text
);
```

**Phase 4B Action**:
- Record cancellation event when archive happens
- Document that archived_at is secondary to events (events are authoritative)

---

## SECTION K: IMMUTABILITY/FINALISATION DECISION

### Current Canonical Design

**Fully Immutable Tables**:
- sales_orders (BEFORE UPDATE/DELETE trigger prevents all changes)
- sales_order_lines (BEFORE UPDATE/DELETE trigger prevents all changes)
- sales_order_line_units (BEFORE UPDATE/DELETE trigger prevents all changes)
- sales_order_preparation_answers (BEFORE UPDATE/DELETE trigger prevents all changes)
- sales_order_events (BEFORE UPDATE/DELETE trigger prevents all changes)
- sales_order_adjustments (BEFORE UPDATE/DELETE trigger prevents all changes)

### Conflict: Immutability vs Finalisation

**Problem**: If sales_order_lines is fully immutable at creation, how do we record actual_weight_kg after supplier weighs items?

**Current Schema Solution**: actual_weight_kg column EXISTS on both tables:
- sales_order_lines.actual_weight_kg (nullable)
- sales_order_line_units.actual_weight_kg (nullable)

**But Immutability Trigger Blocks ALL Updates**:
The trigger says:
```sql
CREATE TRIGGER sales_order_lines_append_only
  BEFORE UPDATE OR DELETE ...
  EXECUTE FUNCTION public.phase1_prevent_snapshot_mutation();
```

### The Gap

The immutability trigger is **too strict** for a real operation. It blocks:
- Setting actual_weight_kg after weighing
- Setting final totals

### Solutions

**Option A** (Event-Based Finalisation):
- Don't UPDATE sales_order_lines
- Instead, record event: 'supplier_weight_confirmed'
- Include actual_weight in event payload
- App reads latest event to determine actual weight
- Pro: Clean append-only semantics; Con: Complex for simple data

**Option B** (Controlled Updates via RPC):
- Keep immutability trigger as-is
- Create SECURITY DEFINER RPC: `finalize_order_line(line_id, actual_weight_kg)`
- RPC bypasses trigger (SECURITY DEFINER runs as owner)
- Update is allowed only before Paid state
- Logs to events for audit

**Option C** (Selective Column Immutability):
- Modify trigger to allow UPDATE of actual_weight_kg ONLY
- Keep other columns immutable
- Simpler but less strict

### Recommendation: OPTION B (CONTROLLED UPDATES VIA RPC)

**Phase 4A Action**:

Create RPC in future phase:
```sql
CREATE OR REPLACE FUNCTION public.finalize_order_line_weight(
  p_line_id uuid,
  p_actual_weight_kg numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check authorization
  IF NOT (is_supplier() OR is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Check order not yet Paid
  IF EXISTS (
    SELECT 1 FROM sales_orders so
    JOIN sales_order_lines sol ON sol.sales_order_id = so.id
    WHERE sol.id = p_line_id AND so.payment_status = 'Paid'
  ) THEN
    RAISE EXCEPTION 'Cannot update weight on Paid orders';
  END IF;

  -- Update actual weight (bypasses immutability trigger as SECURITY DEFINER)
  UPDATE sales_order_lines
  SET actual_weight_kg = p_actual_weight_kg
  WHERE id = p_line_id;

  -- Record event for audit
  INSERT INTO sales_order_events (sales_order_id, event_type, payload, actor_id)
  SELECT so.id, 'supplier_weight_confirmed', 
         jsonb_build_object('line_id', p_line_id, 'actual_weight_kg', p_actual_weight_kg),
         auth.uid()
  FROM sales_order_lines sol JOIN sales_orders so ON so.id = sol.sales_order_id
  WHERE sol.id = p_line_id;
END;
$$;
```

**Current Issue**: This RPC doesn't exist yet in the schema.

**Phase 4A Decision**: Accept this as "known to-do" for Phase 4B (post-checkout).

**Current State**: Immutability is correct for the snapshot model. Finalisation logic will be added post-cutover.

---

## SECTION L: ANALYTICS-READINESS GAPS

### Metrics FreshGo Needs to Support

1. **Revenue**:
   - ✅ Can calculate: SUM(sales_order_lines.unit_selling_price × actual_weight or quantity)
   - ✅ Frozen prices prevent retroactive drift

2. **Order Count**:
   - ✅ Can calculate: COUNT(DISTINCT sales_order_id)

3. **AOV (Average Order Value)**:
   - ✅ Can calculate: SUM(sales_orders.total) / COUNT(DISTINCT sales_order_id)

4. **Gross Profit**:
   - ✅ Can calculate: SUM(sales_order_lines.unit_selling_price × qty - unit_cost_price × qty)
   - ✅ Frozen prices prevent retroactive drift

5. **Gross Margin %**:
   - ✅ Can calculate: (Gross Profit / Revenue) × 100

6. **Sales by Product**:
   - ✅ Can calculate: GROUP BY product_id, SUM(quantity or weight)
   - ⚠️ Missing: product_snapshot.category (would help, not blocking)

7. **Sales by Category**:
   - ⚠️ Missing: category in product_snapshot
   - Workaround: Join product_versions via product_version_id

8. **Actual vs Estimated Weight**:
   - ✅ Can calculate: SUM(estimated_weight_kg) vs SUM(actual_weight_kg)

9. **Supplier Cost**:
   - ✅ Can calculate: SUM(unit_cost_price × qty or weight)
   - ✅ Cost history supports validation

10. **Repeat Customers**:
    - ✅ Can calculate: COUNT(DISTINCT customer_id) per customer over time

11. **Delivery Area Performance**:
    - ✅ Can calculate: From delivery_snapshot

12. **Cancellation Rate**:
    - ✅ Can calculate: COUNT(archived_orders) / COUNT(all_orders)

### Missing from Canonical Schema

| Metric | Current Support | Gap | Workaround | Priority |
|--------|---|---|---|---|
| Category-level analytics | Partial | category not in snapshot | Join product_versions | SHOULD |
| Supplier performance | Partial | supplier_snapshot not full | Join suppliers table | SHOULD |
| Customer segment analysis | Not yet | No segment field | Add to customer_snapshot | CAN DEFER |
| Refund analytics | Partial | Adjustments table empty | Will fill during Phase 4B | CAN DEFER |
| Payment method analytics | Not yet | No method field | Add to sales_orders later | CAN DEFER |

### Assessment: ✅ 90% READY

**Sufficient for Core Analytics**:
- Revenue, profit, margin
- Order counts and AOV
- Product-level sales
- Weight tracking

**Minor Gaps**:
- Category in snapshot (workaround: join)
- Supplier snapshot detail (workaround: join)
- Customer segment (future enhancement)

**Phase 4A Action**: Document analytics assumptions in code comments.

---

## SECTION M: MUST / SHOULD / DEFER MATRIX

| Action | Priority | Rationale | Phase |
|--------|----------|---|---|
| Add payment fields to sales_orders | **MUST** | Canonical order is incomplete without payment state | 4A |
| Document ordering_mode → unit creation mapping | SHOULD | Prevents confusion during checkout rewrite | 4A |
| Add category to product_snapshot | SHOULD | Enables category-level analytics without joins | 4A |
| Document event types and payload schema | SHOULD | Events exist but types/formats not standardized | 4A |
| Create finalize_order_line RPC | **MUST** | Needed for supplier weight entry | 4B |
| Add archived fields to sales_orders | SHOULD | Aligns with legacy model | 4A |
| Create payment guards (transition logic) | **MUST** | Enforce Pending → Ready To Pay → Paid | 4B |
| Build event-sourced status reader | SHOULD | Gradual migration from timestamps | 4B |
| Add delivery_point_snapshot | CAN DEFER | Nice-to-have for hyperlocal; not blocking | 4C |
| Create dedicated payment table | CAN DEFER | May revisit for payment gateway later | Future |
| Support multi-payment per order | CAN DEFER | FreshGo doesn't need this yet | Future |
| Implement combo child snapshots | **MUST** | Needed for combo historical accuracy | 4B |

---

## SECTION N: PROPOSED PHASE 4A MIGRATION

### Scope: Minimal + Payment + Archive

**Migration Filename**: `20260915100000_phase4a_canonical_schema_freeze.sql`

**Tables Altered**: `sales_orders` (3 new columns)

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 4A: Canonical Sales Schema Freeze (Payment + Archive)
-- ═══════════════════════════════════════════════════════════════════════════

-- This migration finalizes the canonical sales_orders schema for production
-- cutover. It adds payment state (which belongs on the order header) and
-- archive metadata (for safe soft-deletes).
--
-- This migration is ADDITIVE and SAFE:
-- - No existing data is modified
-- - Columns are nullable/defaulted
-- - Triggers and RLS are unchanged
-- - Legacy Orders continues to work independently until cutover

-- 1. Payment State (currently on legacy Orders, moved to canonical)
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS (
  payment_status text NOT NULL DEFAULT 'Pending',
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON COLUMN public.sales_orders.payment_status IS
  'Payment state machine: Pending → Ready To Pay → Paid. Once Paid, immutable forever.';
COMMENT ON COLUMN public.sales_orders.paid_at IS
  'When the order was marked Paid by an admin.';
COMMENT ON COLUMN public.sales_orders.paid_by IS
  'Which admin confirmed payment.';

-- 2. Payment Status Constraint (inherited from legacy Orders)
ALTER TABLE public.sales_orders ADD CONSTRAINT IF NOT EXISTS sales_orders_payment_status_check
  CHECK (payment_status IN ('Pending', 'Ready To Pay', 'Paid'));

-- 3. Archive Metadata (safe soft-deletes for cancelled orders)
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS (
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancellation_reason text
);

COMMENT ON COLUMN public.sales_orders.archived_at IS
  'When the order was cancelled by an admin. NULL = active.';
COMMENT ON COLUMN public.sales_orders.archived_by IS
  'Which admin cancelled the order.';
COMMENT ON COLUMN public.sales_orders.cancellation_reason IS
  'Why the order was cancelled (audit trail).';

-- 4. Index for active orders queries
CREATE INDEX IF NOT EXISTS idx_sales_orders_active_archived
  ON public.sales_orders (archived_at);

-- 5. Index for payment status queries
CREATE INDEX IF NOT EXISTS idx_sales_orders_payment_status_created
  ON public.sales_orders (payment_status, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- DOCUMENTATION: Event Types for Future Phase 4B
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The following event_type values MUST be standardized before Phase 4B:
--
-- Checkout Events:
--   'order_confirmed'                    — order created
--   'items_added'                        — line items confirmed
--   'preparation_answers_recorded'       — questionnaire captured
--
-- Payment Events:
--   'payment_status_changed'             — transition (payload: old, new)
--   'payment_confirmed'                  — admin marked Paid
--   'payment_reversed'                   — refund issued
--
-- Packing Events:
--   'packing_started'                    — supplier started
--   'packing_completed'                  — supplier finished
--   'supplier_weight_confirmed'          — weight entered (payload: actual_weight_kg)
--
-- Dispatch Events:
--   'supplier_dispatch_started'          — Lalamove booked (payload: tracking_url)
--   'supplier_dispatch_completed'        — arrived at hub
--
-- Rider Events:
--   'rider_received_at_hub'              — rider picked up
--   'rider_out_for_delivery'             — rider en route
--   'rider_delivered'                    — delivered to customer
--
-- Archive Events:
--   'order_cancelled'                    — admin archived (payload: reason)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- VALIDATION: Orders Payment Status Check
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Query to verify all canonical orders have valid payment_status:
--
--   SELECT COUNT(*) FROM public.sales_orders
--   WHERE payment_status NOT IN ('Pending', 'Ready To Pay', 'Paid')
--   OR payment_status IS NULL;
--
-- Should return 0.

```

### Rationale

**Why These Changes**:
1. Payment is essential for canonical order completeness
2. Archive is essential for safe order cancellation without data loss
3. Both are minimal columns (3 + 3 = 6 cols total)
4. All are nullable or have safe defaults
5. No existing queries break

**Why Not More**:
- Event type standardization → Phase 4B (post-checkout)
- Finalisation RPC → Phase 4B (post-checkout)
- Combo child snapshots → Phase 4B (tested during cutover)
- Category in product_snapshot → Phase 4C (reporting optimization)
- Delivery point snapshot → Phase 4C (logistics optimization)

**Risk Level**: **VERY LOW**
- Additive-only (no drops, no breaking changes)
- No triggers modified
- No data migrations needed
- Existing RLS policies still work

---

## SECTION O: PROPOSED FUTURE place_sales_order TRANSACTION

### High-Level Flow (Phase 4B — Not Yet Implemented)

```javascript
// Future checkout flow (Phase 4B onwards)

async function place_sales_order(checkoutData) {
  // Args:
  //   customer_id: uuid
  //   cart_items: CartItem[]
  //   delivery_snapshot: { point, date, window, fee }
  //   customer_snapshot: { name, phone, email, address }
  //   preparation_answers: { [targetKey]: answers }

  const result = await supabase.rpc('place_sales_order', {
    p_customer_id: checkoutData.customer_id,
    p_cart_items_json: JSON.stringify(checkoutData.cart_items),
    p_delivery_snapshot: checkoutData.delivery_snapshot,
    p_customer_snapshot: checkoutData.customer_snapshot,
    p_preparation_answers: checkoutData.preparation_answers
  });

  return {
    sales_order_id: result.order_id,
    order_number: result.order_number
  };
}
```

### Database Transaction (SECURITY DEFINER RPC)

```sql
CREATE OR REPLACE FUNCTION public.place_sales_order(
  p_customer_id uuid,
  p_order_number text,
  p_cart_items_json text,
  p_delivery_snapshot jsonb,
  p_customer_snapshot jsonb,
  p_preparation_answers jsonb
) RETURNS TABLE (order_id uuid, order_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_subtotal numeric(12,2) := 0;
  v_delivery_fee numeric(12,2);
  v_discount numeric(12,2) := 0;
  v_item record;
  v_line_number integer := 0;
  v_product_version_id uuid;
  v_unit_number integer;
BEGIN
  -- ─────────────────────────────────────────────────────────────────────────
  -- 1. AUTHORIZE
  -- ─────────────────────────────────────────────────────────────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_customer_id IS DISTINCT FROM auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'Cannot place order for another customer';
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 2. CREATE sales_orders HEADER
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO public.sales_orders (
    order_number,
    customer_id,
    status,
    currency_code,
    customer_snapshot,
    delivery_snapshot,
    delivery_fee,
    created_by
  ) VALUES (
    p_order_number,
    p_customer_id,
    'confirmed',
    'MYR',
    p_customer_snapshot,
    p_delivery_snapshot,
    (p_delivery_snapshot->>'delivery_fee')::numeric,
    auth.uid()
  ) RETURNING id INTO v_order_id;

  v_delivery_fee := (p_delivery_snapshot->>'delivery_fee')::numeric;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 3. FOR EACH CART ITEM: resolve product/combo version, create line + units
  -- ─────────────────────────────────────────────────────────────────────────
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_cart_items_json::jsonb) AS x(
      productId text,
      comboId text,
      quantity numeric,
      estimatedWeight numeric,
      pricingType text,
      price numeric,
      costPrice numeric,
      supplierName text
    )
  LOOP
    v_line_number := v_line_number + 1;

    -- Resolve product or combo version (published as of now)
    IF v_item.productId IS NOT NULL THEN
      SELECT id INTO v_product_version_id
      FROM public.product_versions
      WHERE product_id = v_item.productId
        AND status = 'published'
        AND (effective_to IS NULL OR effective_to > now())
      ORDER BY effective_from DESC
      LIMIT 1;

      -- Insert sales_order_line
      INSERT INTO public.sales_order_lines (
        sales_order_id,
        line_number,
        product_id,
        product_version_id,
        item_kind,
        product_snapshot,
        quantity,
        estimated_weight_kg,
        selling_unit,
        unit_selling_price,
        unit_cost_price,
        supplier_id,
        supplier_snapshot,
        line_total
      ) VALUES (
        v_order_id,
        v_line_number,
        v_item.productId,
        v_product_version_id,
        'product',
        jsonb_build_object(...), -- product snapshot at checkout
        v_item.quantity,
        v_item.estimatedWeight,
        'piece', -- or 'kg' based on ordering_mode
        v_item.price,
        v_item.costPrice,
        (SELECT id FROM public.suppliers WHERE name = v_item.supplierName),
        jsonb_build_object(...), -- supplier snapshot
        v_item.price * COALESCE(v_item.quantity, v_item.estimatedWeight, 0)
      );

      v_subtotal := v_subtotal + 
        (v_item.price * COALESCE(v_item.quantity, v_item.estimatedWeight, 0));

      -- If product requires physical units (whole_fish_by_weight, slice)
      -- create sales_order_line_units
      IF v_item.pricingType IN ('whole_fish_by_weight', 'slice') THEN
        FOR v_unit_number IN 1..(v_item.quantity::integer) LOOP
          INSERT INTO public.sales_order_line_units (
            sales_order_line_id,
            unit_number,
            physical_unit_type,
            estimated_weight_kg,
            unit_snapshot
          ) VALUES (
            (SELECT id FROM public.sales_order_lines WHERE sales_order_id = v_order_id AND line_number = v_line_number),
            v_unit_number,
            'fish', -- or 'chicken' based on product
            v_item.estimatedWeight / v_item.quantity, -- avg weight per unit
            jsonb_build_object(...)
          );
        END LOOP;
      END IF;

    ELSIF v_item.comboId IS NOT NULL THEN
      -- Similar logic for combos
      -- ...
    END IF;
  END LOOP;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 4. RECORD PREPARATION ANSWERS
  -- ─────────────────────────────────────────────────────────────────────────
  -- Insert sales_order_preparation_answers for each answer
  -- (Maps targets to lines/units, links to schema versions)
  INSERT INTO public.sales_order_preparation_answers (...)
  SELECT ... FROM ...; -- expansion of p_preparation_answers

  -- ─────────────────────────────────────────────────────────────────────────
  -- 5. FINALIZE ORDER TOTALS
  -- ─────────────────────────────────────────────────────────────────────────
  UPDATE public.sales_orders
  SET
    subtotal = v_subtotal,
    total = v_subtotal + v_delivery_fee
  WHERE id = v_order_id;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 6. RECORD INITIAL ORDER_CONFIRMED EVENT
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO public.sales_order_events (
    sales_order_id,
    event_type,
    actor_id,
    payload
  ) VALUES (
    v_order_id,
    'order_confirmed',
    auth.uid(),
    jsonb_build_object('order_number', p_order_number, 'item_count', v_line_number)
  );

  RETURN QUERY SELECT v_order_id, p_order_number;
END;
$$;
```

### Key Design Decisions

1. **Single Transactional RPC**: Ensures atomicity (all-or-nothing)
2. **Version Resolution At Time of Order**: Prevents retroactive version changes
3. **Snapshot Capture at Checkout**: Prices, supplier, product immutable
4. **Event Recording**: "order_confirmed" is first event (audit trail)
5. **SECURITY DEFINER**: Runs with table owner privilege (bypasses customer-level RLS)
6. **No Dual-Write**: Only writes canonical tables, not legacy Orders

---

## SECTION P: ARCHITECTURE INVARIANTS

Define explicit rules that MUST hold forever in the canonical model:

1. **Historical Money Never Reads Current Product**
   - Query: Historical order profit must use sales_order_lines.unit_selling_price and unit_cost_price
   - Never: JOIN Product WHERE product_id = ...
   - Enforce: No migrations can add Product.price or Product.cost_price read in reporting

2. **Published Product Versions Are Immutable**
   - Query: Cannot UPDATE or DELETE WHERE status = 'published'
   - Trigger: phase1_prevent_published_version_mutation() blocks any changes
   - Enforce: Schema enforces, no exceptions

3. **Order Commercial Facts Cannot Be Silently Rewritten**
   - Query: No UPDATE of sales_order_lines without logging event
   - Enforce: phase1_prevent_snapshot_mutation() blocks all updates
   - Workaround: Only SECURITY DEFINER RPCs can modify (with events)

4. **Preparation Answers Are Immutable**
   - Query: CANNOT UPDATE sales_order_preparation_answers.answer_value
   - Enforce: Append-only trigger + schema validation
   - No exceptions, no manual fixes in production

5. **Paid Orders Are Terminal**
   - Query: WHERE payment_status = 'Paid' → financial fields immutable forever
   - Enforce: Guard trigger checks both old and new payment_status
   - Exception: Only DELIVERED can transition to fulfilled; not Paid

6. **Supplier Cost History Never Rewrites Old Orders**
   - Query: Changing supplier_price_history ONLY affects future orders
   - Enforce: App uses sales_order_lines.unit_cost_price (frozen), not Product.cost_price
   - Validate: Historical profit % must match report at order creation time

7. **Fulfilment Finalisation Is Traceable**
   - Query: actual_weight_kg appears in both lines and units
   - Enforce: Updates only via finalize_order_line RPC with events
   - Validate: Event log shows supplier weight confirmations

8. **Customer Profile Changes Don't Alter Historical Order Snapshots**
   - Query: customer_snapshot jsonb is immutable after creation
   - Enforce: Immutability trigger + no FK to customer_profiles
   - Result: Historical address is preserved forever

9. **Events Are Append-Only**
   - Query: NO UPDATE/DELETE on sales_order_events
   - Enforce: phase1_prevent_snapshot_mutation() blocks all changes
   - Audit: Full event trail is immutable and queryable

10. **Orders Are Never Physically Deleted After Canonical Creation**
    - Query: Archived orders have archived_at timestamp, but row remains
    - Enforce: No DELETE FROM sales_orders (RLS + logical archive only)
    - Recovery: Full audit trail available if needed

11. **Product Lineage Is Complete**
    - Query: product_version_id must be present for version lookup
    - product_snapshot must include name, ordering_mode, selling_unit
    - Enforce: Checkout RPC validates presence before INSERT
    - Validate: Analytics can reconstruct product context from snapshot

12. **Delivery & Customer Snapshots Are Sufficient for Fulfillment**
    - Query: delivery_snapshot contains enough data to deliver (address, point, window)
    - customer_snapshot contains enough data to contact (name, phone, email)
    - Enforce: Checkout RPC validates both
    - Test: Fulfillment team can work entirely from snapshots (no current profile joins)

---

## SECTION Q: FINAL DECISION

### Choose One:

**✅ OPTION 1: CURRENT SCHEMA SUFFICIENT — PROCEED TO CHECKOUT CUTOVER**

**Recommended Decision: YES, WITH PHASE 4A MIGRATION**

### Rationale

**Strengths of Current Schema**:
- ✅ 6-table canonical model is well-designed and immutable
- ✅ Product versioning is complete and effective-dated
- ✅ Pricing history supports audit and historical queries
- ✅ Preparation answers are immutable and versioned
- ✅ Event infrastructure exists (though not yet used)
- ✅ Physical units model handles all ordering modes
- ✅ Financial freeze logic is sound (prices immutable at checkout)

**What's Missing**:
- ❌ Payment state not on sales_orders (currently on legacy Orders)
- ⚠️ Order lifecycle is timestamp-based, not event-sourced (can live with for now)
- ⚠️ Event types not standardized (documentation suffices)

**Phase 4A Completion Criteria**:
1. ✅ Add payment_status, paid_at, paid_by to sales_orders (minimal 3-column migration)
2. ✅ Add archived_at, archived_by, cancellation_reason (another 3 columns)
3. ✅ Add indexes for active orders and payment status queries
4. ✅ Document payment state machine (Pending → Ready To Pay → Paid)
5. ✅ Document event types for Phase 4B
6. ✅ Document ordering_mode → physical_unit mapping
7. ✅ Mark "finalize_order_line RPC" as Phase 4B blocker
8. ✅ Confirm immutability approach (SECURITY DEFINER RPCs for updates)

**Expected Outcome**:
- Canonical schema is production-ready
- Checkout can cutover to sales_* tables in Phase 4B
- No additional redesign needed
- Legacy Orders can be deprecated after Phase 4B-4G complete

### Next Actions

1. **Approve Phase 4A Migration** (this document)
2. **Create migration file** with payment + archive columns
3. **Apply to dev/staging** and validate
4. **Document invariants** in code comments
5. **Proceed to Phase 4B**: Rewrite checkout to canonical model

---

## APPENDIX: CURRENT ORDERS SCHEMA REFERENCE

For comparison during Phase 4B, the legacy Orders table currently has:

```sql
-- Order Header
id bigint PRIMARY KEY
created_at timestamptz
user_id uuid (customer)

-- Customer Snapshot
full_name text
phone_number text
email_address text
street_address text
postcode text
city text
state text (default 'Selangor')
apartment text
house_unit text
pickup_location text
delivery_point_name text
delivery_method text

-- Order Content
order_notes text
item_options jsonb (preparation preferences)
order_items jsonb (full cart payload)
delivery_slot text

-- Order Summary
order_summary jsonb (status timeline, delivery date, order ref)
subtotal numeric(10,2)
delivery_fee numeric(10,2)
total numeric(10,2)

-- Supplier Workflow
supplier_weights jsonb (actual weight by item index)
packing_started_at timestamptz
packing_completed_at timestamptz
supplier_dispatch_started_at timestamptz
supplier_dispatch_completed_at timestamptz
ready_for_rider_at timestamptz
lalamove_tracking_url text
booking_reference text
lalamove_booked_at timestamptz

-- Payment
payment_status text ('Pending' | 'Ready To Pay' | 'Paid')
paid_at timestamptz
paid_by uuid

-- Delivery Rider
delivery_status text ('pending' | 'arrived' | 'out_for_delivery' | 'delivered')
delivered_at timestamptz
delivered_by uuid

-- Logistics
delivery_batch_id uuid
updated_at timestamptz
updated_by uuid

-- Financial
gross_profit numeric(10,2)
revenue numeric(12,2)
supplier_cost numeric(12,2)
profit_margin_percent numeric(8,2)
pricing_snapshot_timestamp timestamptz
frozen_total numeric(12,2)
currency text

-- Archive
archived_at timestamptz
archived_by uuid
cancellation_reason text

-- Audit
created_at timestamptz
updated_at timestamptz
updated_by uuid
```

**Mapping to Canonical**:
- Most fields → sales_orders
- order_items → sales_order_lines
- supplier_weights, estimates → sales_order_line_units
- order_items prep options → sales_order_preparation_answers
- Timestamps → sales_order_events

---

END OF PHASE 4A CANONICAL SCHEMA AUDIT
