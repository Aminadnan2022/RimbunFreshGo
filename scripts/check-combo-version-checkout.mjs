import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalCheckoutItems } from '../src/lib/canonicalCheckoutItems.ts';
import { selectComboCartItems } from '../src/lib/comboCartSelection.ts';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const failures = [];

const currentVersionId = '11111111-1111-4111-8111-111111111111';
const previousVersionId = '22222222-2222-4222-8222-222222222222';
const fixed = {
  productId: 'fixed-product', comboItemId: 'fixed-source', name: 'Fixed', image: '', price: 1,
  unit: 'piece', quantity: 1, label: 'Fixed',
};
const selected = {
  productId: 'selected-product', comboItemId: 'selected-source', name: 'Selected', image: '', price: 1,
  unit: 'piece', quantity: 1, label: 'Selected', choiceGroupKey: 'protein',
};
const cartItem = {
  productId: 'combo-a', comboId: 'combo-a', comboVersionId: currentVersionId, isCombo: true,
  name: 'Current combo', image: '', price: 50, unit: 'combo', quantity: 1,
  comboItems: [fixed, selected],
};
const payload = canonicalCheckoutItems([cartItem])[0];

if (payload.combo_version_id !== currentVersionId) failures.push('current immutable combo version is not serialized');
if (payload.combo_components?.length !== 2) failures.push('fixed and selected-only projection is not preserved');
if (payload.combo_selections?.length !== 1 || payload.combo_selections[0].combo_item_id !== 'selected-source') {
  failures.push('Customer Choice does not serialize selected option only');
}
const retryPayload = canonicalCheckoutItems([cartItem])[0];
if (JSON.stringify(retryPayload) !== JSON.stringify(payload)) failures.push('same cart retry payload is not deterministic');

// Reproduce the UI runtime path: immutable storefront result -> Combo Detail
// Customer Choice projection -> cart JSON persistence/rehydration -> receipt
// staging boundary -> guarded placement request builder.
const fetchedCombo = {
  combo: { id: 'combo-a', name: 'Current combo', image: '', price: 50 },
  comboVersionId: currentVersionId,
  items: [
    { id: 'fixed-version-item', combo_id: 'combo-a', product_id: 'fixed-product', quantity_value: 1, selling_unit: 'piece', sort_order: 0, created_at: '' },
    { id: 'choice-a-version-item', combo_id: 'combo-a', product_id: 'choice-a', quantity_value: 1, selling_unit: 'piece', sort_order: 1, created_at: '', choice_group_key: 'protein' },
    { id: 'choice-b-version-item', combo_id: 'combo-a', product_id: 'choice-b', quantity_value: 1, selling_unit: 'piece', sort_order: 2, created_at: '', choice_group_key: 'protein' },
  ],
};
const detailSelection = selectComboCartItems(fetchedCombo, ['choice-b-version-item']);
const detailCartItem = {
  productId: detailSelection.combo.id, comboId: detailSelection.combo.id,
  comboVersionId: detailSelection.comboVersionId, isCombo: true,
  name: detailSelection.combo.name, image: '', price: detailSelection.combo.price,
  unit: 'combo', quantity: 1,
  comboItems: detailSelection.items.map((part) => ({
    productId: part.product_id, comboItemId: part.id, componentNumber: part.sort_order + 1,
    name: part.product_id, image: '', price: 0, unit: part.selling_unit,
    quantity: 1, quantityValue: part.quantity_value, sellingUnit: part.selling_unit,
    label: part.product_id, choiceGroupKey: part.choice_group_key,
  })),
};
const rehydratedCartItem = JSON.parse(JSON.stringify(detailCartItem));
const stagedReceipt = { storagePath: 'checkout-staging/test/receipt.png', fileName: 'receipt.png' };
if (!stagedReceipt.storagePath || rehydratedCartItem.comboVersionId !== currentVersionId) {
  failures.push('combo version identity was lost across detail selection, persistence, or receipt staging');
}
const guardedItem = canonicalCheckoutItems([rehydratedCartItem])[0];
if (guardedItem.combo_version_id !== currentVersionId) failures.push('guarded placement lost the storefront combo version id');
if (JSON.stringify(guardedItem.combo_components?.map((part) => part.combo_item_id)) !== JSON.stringify(['fixed-version-item', 'choice-b-version-item'])) {
  failures.push('guarded placement does not carry the exact selected published version-item identities');
}

const activatedCombo = { ...fetchedCombo, comboVersionId: previousVersionId };
const newCartAfterActivation = selectComboCartItems(activatedCombo, ['choice-b-version-item']);
if (rehydratedCartItem.comboVersionId !== currentVersionId) failures.push('new activation mutated the old persisted cart identity');
if (newCartAfterActivation.comboVersionId !== previousVersionId) failures.push('new cart did not adopt the newly fetched active version identity');

const stalePayload = canonicalCheckoutItems([{ ...cartItem, comboVersionId: previousVersionId }])[0];
if (stalePayload.combo_version_id !== previousVersionId) failures.push('old cart version identity is not retained for server rejection');

const data = read('src/data/combos.ts');
for (const token of ['fetchCurrentComboVersionItems', ".from('combo_versions')", ".from('combo_version_items')", 'comboVersionId: version.id', 'id: row.id']) {
  if (!data.includes(token)) failures.push(`storefront immutable recipe source missing: ${token}`);
}

const detailPage = read('src/pages/ComboDetailPage.tsx');
if (!detailPage.includes('buildSelectedComboCartItem(comboWithItems')) {
  failures.push('Combo Detail bypasses the version-preserving cart serialization helper');
}

const migration = read('supabase/migrations/20261025000000_combo_version_checkout_identity.sql');
for (const token of [
  "v_item->>'combo_version_id' IS DISTINCT FROM NEW.combo_version_id::text",
  "cvi.id::text = selected->>'combo_item_id'",
  "v_expected->>'combo_item_id' = v_choice.id::text",
  'Refresh and reselect it before placing the order',
  'SET effective_to = v_published_at',
  'MAX(version_number)',
  'INSERT INTO public.combo_version_items',
]) if (!migration.includes(token)) failures.push(`version lifecycle/freshness safeguard missing: ${token}`);
const choiceMigration = read('supabase/migrations/20261020000000_combo_customer_choice_mvp.sql');
if (!choiceMigration.includes('combo_choice_version_snapshot') || !choiceMigration.includes('source_combo_item_id')) {
  failures.push('immutable version items do not snapshot mutable source identities');
}

const staging = read('supabase/migrations/20261022000000_checkout_payment_receipt_staging.sql');
if (!staging.includes('consumed_sales_order_id') || !staging.includes('FROM public.place_sales_order(')) {
  failures.push('staged receipt and same-key canonical placement path changed');
}

const storefrontGrant = read('supabase/migrations/20261025000001_combo_version_storefront_read.sql');
if (!storefrontGrant.includes('GRANT SELECT ON TABLE public.combo_versions, public.combo_version_items TO anon, authenticated')) {
  failures.push('public storefront cannot read published immutable combo recipes through RLS');
}

if (failures.length) {
  console.error('Combo version checkout checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Combo version checkout checks passed (current version identity, edit/activate publishing, stale rejection, fixed/choice projection, staged receipt, and deterministic retry).');
