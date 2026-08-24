import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalCheckoutItems } from '../src/lib/canonicalCheckoutItems.ts';
import { isPriceFinalAtCheckout } from '../src/lib/checkoutPricing.ts';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const migration = read('supabase/migrations/20261107000000_reset_sales_order_line_version_references.sql');
const schema = read('supabase/migrations/20260903000001_phase1_immutable_order_snapshots.sql');
const failures = [];
const comboVersionId = '11111111-1111-4111-8111-111111111111';
const cart = [
  { productId: 'combo-rimbun', comboId: 'combo-rimbun', comboVersionId, isCombo: true, name: 'Combo', image: '', price: 30, unit: 'combo', quantity: 1, orderingMode: 'combo', comboItems: [{ productId: 'combo-chicken', comboItemId: 'combo-chicken-item', name: 'Chicken', image: '', price: 0, unit: 'unit', quantity: 1 }] },
  { productId: 'chicken', name: 'Chicken', image: '', price: 12, unit: 'unit', quantity: 1, orderingMode: 'fixed_quantity', pricingType: 'fixed' },
  { productId: 'bawal', name: 'Bawal', image: '', price: 20, unit: 'kg', quantity: 1, estimatedWeight: 1, orderingMode: 'whole_fish_by_weight', pricingType: 'per_kg' },
];
const payload = canonicalCheckoutItems(cart);
for (const [index, expected] of [{ combo_id: 'combo-rimbun', combo_version_id: comboVersionId }, { product_id: 'chicken' }, { product_id: 'bawal' }].entries()) for (const [field, value] of Object.entries(expected)) if (payload[index][field] !== value) failures.push(`mixed-cart p_items line ${index + 1} lost ${field}`);
if (!payload[2].estimated_weight_kg) failures.push('mixed-cart Bawal payload lost its estimated weight');
if (isPriceFinalAtCheckout(cart) !== false) failures.push('mixed fixed + variable cart must remain deferred payment');
const resolved = payload.map((item, index) => ({ item_kind: item.combo_id ? 'combo' : 'product', product_version_id: item.product_id ? `product-version-${index + 1}` : null, combo_version_id: item.combo_id ? `combo-version-${index + 1}` : null }));
for (const [index, line] of resolved.entries()) if (!((line.item_kind === 'product' && line.product_version_id && !line.combo_version_id) || (line.item_kind === 'combo' && line.combo_version_id && !line.product_version_id))) failures.push(`line ${index + 1} violates mutually exclusive version lineage`);
for (const token of ['normalize_sales_order_line_version_reference', "IF NEW.item_kind = 'product' THEN", 'NEW.combo_version_id := NULL;', "ELSIF NEW.item_kind = 'combo' THEN", 'NEW.product_version_id := NULL;', 'BEFORE INSERT OR UPDATE']) if (!migration.includes(token)) failures.push(`missing serializer repair safeguard: ${token}`);
for (const token of ["(item_kind = 'product' AND product_version_id IS NOT NULL AND combo_version_id IS NULL)", "(item_kind = 'combo' AND combo_version_id IS NOT NULL AND product_version_id IS NULL)"]) if (!schema.includes(token)) failures.push(`version-reference invariant changed or missing: ${token}`);
if (failures.length) { console.error('Mixed-cart version-reference checks failed:'); failures.forEach((failure) => console.error(`- ${failure}`)); process.exit(1); }
console.log('Mixed-cart version-reference checks passed (combo + Chicken + Bawal payload, exclusive immutable lineage, and deferred payment).');
