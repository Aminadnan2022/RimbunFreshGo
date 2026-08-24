import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20261101000000_restore_admin_delivery_point_delete_access.sql'),
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
  if (!migration.includes(token)) failures.push(`missing delivery-point deletion safeguard: ${token}`);
}

if (/GRANT\s+ALL\s+ON\s+TABLE\s+public\.delivery_points\s+TO\s+authenticated/i.test(migration)) {
  failures.push('authenticated must not receive unrestricted delivery_points access');
}

if (failures.length) {
  console.error('Delivery-point deletion access checks failed:\n- ' + failures.join('\n- '));
  process.exitCode = 1;
} else {
  console.log('Delivery-point deletion access checks passed (PostgREST can reach the admin-only RLS policy).');
}
