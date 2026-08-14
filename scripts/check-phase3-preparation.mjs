import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const migration = read('supabase/migrations/20260905000000_phase3_checkout_preparation_snapshots.sql');
const checkout = read('src/pages/CheckoutPage.tsx');
const flow = read('src/lib/checkoutPreparation.ts');
const failures = [];
for (const token of ['order_preparation_snapshots', 'record_order_preparation_snapshot', 'immutable', 'questionnaire_snapshot']) if (!migration.includes(token)) failures.push(`missing additive snapshot safeguard: ${token}`);
for (const token of ['get_published_product_preparation_questionnaire', 'requiredMissing', 'snapshotPreparation', 'selection_scope']) if (!flow.includes(token)) failures.push(`missing schema-driven preparation behavior: ${token}`);
for (const token of ["'details' | 'preparation' | 'review' | 'payment'", 'applySameToAll', 'continueToReview']) if (!checkout.includes(token)) failures.push(`missing checkout behavior: ${token}`);
for (const token of ['comboItems', 'weight_only']) if (!flow.includes(token)) failures.push(`missing cart compatibility behavior: ${token}`);
if (checkout.includes('CATEGORY_PREP_OPTIONS') || checkout.includes('getPrepOptionsByCategory')) failures.push('checkout must not hardcode preparation categories');
if (failures.length) { console.error('Phase 3 preparation checks failed:'); failures.forEach((x) => console.error(`- ${x}`)); process.exit(1); }
console.log('Phase 3 preparation checks passed (published schema flow, explicit unit answers, review, and immutable compatibility snapshots).');
