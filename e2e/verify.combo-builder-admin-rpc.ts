import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

function envValue(name: string): string | undefined {
  const line = readFileSync('.env.test', 'utf8').split(/\r?\n/).find((value) => value.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
}

const url = envValue('VITE_SUPABASE_URL');
const anonKey = envValue('VITE_SUPABASE_ANON_KEY');
const serviceKey = envValue('TEST_SUPABASE_SERVICE_ROLE_KEY');
if (!url || !anonKey || !serviceKey) throw new Error('Missing Supabase E2E credentials.');
if (!url.includes('jypujsyiecgcjtjrqjfx')) throw new Error('Safety stop: Combo Builder test is limited to jypujsyiecgcjtjrqjfx.');

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const users: string[] = [];
let failures = 0;
const pass = (message: string) => console.log(`PASS: ${message}`);
const fail = (message: string) => { failures++; console.error(`FAIL: ${message}`); };

async function clientFor(role: 'admin' | 'customer'): Promise<SupabaseClient> {
  const email = `combo-${role}-${Date.now()}-${randomBytes(3).toString('hex')}@example.com`;
  const password = `Test-${randomBytes(18).toString('base64url')}!`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`Could not create ${role}: ${error?.message ?? 'no user'}`);
  users.push(data.user.id);
  const { error: roleError } = await service.from('user_roles').upsert({ id: data.user.id, role });
  if (roleError) throw new Error(`Could not assign ${role}: ${roleError.message}`);
  const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`Could not sign in ${role}: ${signInError.message}`);
  return client;
}

async function main() {
  const admin = await clientFor('admin');
  const customer = await clientFor('customer');
  const { data: source, error: sourceError } = await service
    .from('combos')
    .select('id,name,active,lifecycle_status,featured')
    .eq('active', true)
    .eq('lifecycle_status', 'active')
    .limit(1)
    .single();
  if (sourceError || !source) throw new Error(`No active combo source: ${sourceError?.message ?? 'none'}`);
  const { count: sourceItemCount } = await service.from('combo_items').select('*', { count: 'exact', head: true }).eq('combo_id', source.id);

  const denied = await customer.rpc('admin_duplicate_combo', { p_source_combo_id: source.id });
  if (denied.error?.code === '42501') pass('non-admin duplicate is denied'); else fail(`non-admin duplicate was not denied: ${denied.error?.message ?? 'no error'}`);

  const directInsert = await customer.from('combos').insert({ id: `forbidden-${Date.now()}`, name: 'forbidden', slug: `forbidden-${Date.now()}` });
  if (directInsert.error?.code === '42501') pass('authenticated client has no direct combos INSERT privilege'); else fail(`direct combos INSERT was not denied: ${directInsert.error?.message ?? 'no error'}`);

  const { data: duplicateId, error: duplicateError } = await admin.rpc('admin_duplicate_combo', { p_source_combo_id: source.id });
  if (duplicateError || !duplicateId) throw new Error(`admin duplicate failed: ${duplicateError?.message ?? 'no id'}`);
  pass('admin duplicate succeeds through RPC');

  const { data: duplicate, error: duplicateReadError } = await service
    .from('combos').select('id,name,active,lifecycle_status,featured,is_pinned').eq('id', duplicateId).single();
  if (duplicateReadError || !duplicate) throw new Error(`duplicate cannot be read: ${duplicateReadError?.message ?? 'none'}`);
  if (duplicate.id !== source.id && duplicate.lifecycle_status === 'draft' && !duplicate.active && !duplicate.featured && !duplicate.is_pinned) pass('duplicate is distinct, Draft, inactive, and unfeatured'); else fail('duplicate lifecycle/presentation is incorrect');
  const { count: duplicateItemCount } = await service.from('combo_items').select('*', { count: 'exact', head: true }).eq('combo_id', duplicateId);
  if (duplicateItemCount === sourceItemCount) pass('duplicate preserves copied items'); else fail(`copied item count ${duplicateItemCount} differs from source ${sourceItemCount}`);
  const hidden = await customer.from('combos').select('id').eq('id', duplicateId).maybeSingle();
  if (!hidden.error && hidden.data === null) pass('draft duplicate is hidden from storefront'); else fail(`draft duplicate was visible or failed unexpectedly: ${hidden.error?.message ?? 'visible'}`);

  const { data: sourceAfter } = await service.from('combos').select('id,name,active,lifecycle_status,featured').eq('id', source.id).single();
  if (JSON.stringify(sourceAfter) === JSON.stringify(source)) pass('source combo is unchanged'); else fail('source combo changed during duplicate');

  const activate = await admin.rpc('admin_set_combo_lifecycle', { p_combo_id: duplicateId, p_lifecycle_status: 'active' });
  if (activate.error) fail(`activation failed: ${activate.error.message}`); else pass('duplicate activation succeeds');
  const visible = await customer.from('combos').select('id').eq('id', duplicateId).maybeSingle();
  if (!visible.error && visible.data?.id === duplicateId) pass('activated duplicate is visible to storefront'); else fail(`activated duplicate not visible: ${visible.error?.message ?? 'none'}`);
  const deactivate = await admin.rpc('admin_set_combo_lifecycle', { p_combo_id: duplicateId, p_lifecycle_status: 'inactive' });
  if (deactivate.error) fail(`deactivation failed: ${deactivate.error.message}`); else pass('duplicate deactivation succeeds');
  const hiddenAgain = await customer.from('combos').select('id').eq('id', duplicateId).maybeSingle();
  if (!hiddenAgain.error && hiddenAgain.data === null) pass('deactivated duplicate is hidden from storefront'); else fail(`deactivated duplicate remained visible: ${hiddenAgain.error?.message ?? 'none'}`);
}

main().catch((error) => { failures++; console.error(error); }).finally(async () => {
  await Promise.all(users.map((id) => service.auth.admin.deleteUser(id)));
  if (failures) process.exitCode = 1;
});
