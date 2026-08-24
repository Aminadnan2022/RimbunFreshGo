import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const deleteMigration = readFileSync(
  resolve(root, 'supabase/migrations/20261101000000_restore_admin_delivery_point_delete_access.sql'),
  'utf8',
);
const writeMigration = readFileSync(
  resolve(root, 'supabase/migrations/20261102000000_restore_admin_delivery_point_write_access.sql'),
  'utf8',
);
const handoverNotesMigration = readFileSync(
  resolve(root, 'supabase/migrations/20261103000000_add_customer_handover_notes_for_emas_and_parkland.sql'),
  'utf8',
);

const failures = [];
for (const token of [
  'ALTER TABLE public.delivery_points ENABLE ROW LEVEL SECURITY',
  'GRANT DELETE ON TABLE public.delivery_points TO authenticated',
  'CREATE POLICY "admin_delete_delivery_points" ON public.delivery_points',
  'FOR DELETE TO authenticated',
  'USING (public.is_admin())',
]) {
  if (!deleteMigration.includes(token)) failures.push(`missing delivery-point deletion safeguard: ${token}`);
}

for (const token of [
  'GRANT INSERT, UPDATE ON TABLE public.delivery_points TO authenticated',
  'CREATE POLICY "admin_insert_delivery_points" ON public.delivery_points',
  'FOR INSERT TO authenticated',
  'CREATE POLICY "admin_update_delivery_points" ON public.delivery_points',
  'FOR UPDATE TO authenticated',
  'WITH CHECK (public.is_admin())',
]) {
  if (!writeMigration.includes(token)) failures.push(`missing delivery-point write safeguard: ${token}`);
}

if (/GRANT\s+ALL\s+ON\s+TABLE\s+public\.delivery_points\s+TO\s+authenticated/i.test(`${deleteMigration}\n${writeMigration}`)) {
  failures.push('authenticated must not receive unrestricted delivery_points access');
}

for (const token of [
  "Please come down to collect your order; the delivery rider will wait in the vehicle until you arrive for handover.",
  "COALESCE(area, '') ILIKE '%Emas%'",
  "COALESCE(area, '') ILIKE '%Parkland%'",
  "COALESCE(btrim(pickup_notes), '') = ''",
]) {
  if (!handoverNotesMigration.includes(token)) failures.push(`missing customer handover-note safeguard: ${token}`);
}

if (failures.length) {
  console.error('Delivery-point deletion access checks failed:\n- ' + failures.join('\n- '));
  process.exitCode = 1;
} else {
  console.log('Delivery-point write access checks passed (PostgREST can reach the admin-only RLS policies).');
}
