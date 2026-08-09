// e2e/verify.auth.ts
import { createClient as createClient2 } from "@supabase/supabase-js";

// e2e/support/env.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
var TEST_ENV_FILE = resolve(process.cwd(), ".env.test");
var PRODUCTION_SUPABASE_URLS = [
  "https://zcfpdmjjmihhvtuwngii.supabase.co",
  "https://zcfpdmjjmihhvtuwngii.supabase.co/",
  "https://zcfpdmjjmihhvtuwng2166.supabase.co",
  "https://zcfpdmjjmihhvtuwng2166.supabase.co/"
];
function readDotEnv(path) {
  const out = {};
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}
var EMPTY_CREDENTIALS = {};
function normalizeUrl(value) {
  if (!value) return void 0;
  return value.trim().replace(/\/+$/, "");
}
function loadTestEnv(env2 = process.env, dotEnv = readDotEnv(TEST_ENV_FILE)) {
  const value = (key) => {
    const fromFile = dotEnv[key];
    const fromProcess = env2[key];
    if (fromProcess !== void 0 && fromProcess !== "") return fromProcess;
    return fromFile !== void 0 && fromFile !== "" ? fromFile : void 0;
  };
  const roleKeys = {
    admin: { email: "TEST_ADMIN_EMAIL", password: "TEST_ADMIN_PASSWORD" },
    customer: { email: "TEST_CUSTOMER_EMAIL", password: "TEST_CUSTOMER_PASSWORD" },
    supplier: { email: "TEST_SUPPLIER_EMAIL", password: "TEST_SUPPLIER_PASSWORD" },
    delivery_rider: { email: "TEST_RIDER_EMAIL", password: "TEST_RIDER_PASSWORD" }
  };
  const roles2 = {};
  for (const role of Object.keys(roleKeys)) {
    const email = value(roleKeys[role].email);
    const password = value(roleKeys[role].password);
    roles2[role] = email || password ? { email, password } : EMPTY_CREDENTIALS;
  }
  return {
    supabaseUrl: normalizeUrl(value("VITE_SUPABASE_URL")),
    supabaseAnonKey: value("VITE_SUPABASE_ANON_KEY"),
    serviceRoleKey: value("TEST_SUPABASE_SERVICE_ROLE_KEY"),
    baseURL: value("PLAYWRIGHT_BASE_URL") ?? "http://localhost:5173",
    roles: roles2,
    runId: value("TEST_RUN_ID")
  };
}
function isProductionSupabaseUrl(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  return PRODUCTION_SUPABASE_URLS.includes(normalized);
}
function assertSafeSupabaseUrl(supabaseUrl) {
  if (!supabaseUrl) {
    throw new Error(
      "No Supabase URL configured for the E2E test environment. Set VITE_SUPABASE_URL in .env.test (never .env)."
    );
  }
  if (isProductionSupabaseUrl(supabaseUrl)) {
    throw new Error(
      "Refusing to run destructive E2E setup against the FreshGo production Supabase project."
    );
  }
}

// e2e/support/fixtures.ts
import { createClient } from "@supabase/supabase-js";

// e2e/support/safety.ts
function assertSafeForDestructiveSetup(overrides) {
  const testEnv = { ...loadTestEnv(), ...overrides };
  assertSafeSupabaseUrl(testEnv.supabaseUrl);
  if (!testEnv.supabaseAnonKey) {
    throw new Error(
      "VITE_SUPABASE_ANON_KEY is required in .env.test for the E2E test environment."
    );
  }
  return {
    supabaseUrl: testEnv.supabaseUrl,
    supabaseAnonKey: testEnv.supabaseAnonKey
  };
}

// e2e/support/fixtures.ts
var ROLE_LABELS = {
  admin: "admin",
  customer: "customer",
  supplier: "supplier",
  delivery_rider: "delivery_rider"
};
function createTestRunId(now = /* @__PURE__ */ new Date()) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `E2E-${date}-${suffix}`;
}
function currentTestRunId() {
  const env2 = loadTestEnv();
  return env2.runId ?? createTestRunId();
}
function testEmailForRun(role, runId2) {
  return `${ROLE_LABELS[role]}.${runId2.toLowerCase()}@example.com`;
}
function getServiceClient() {
  const env2 = assertSafeForDestructiveSetup();
  const { serviceRoleKey } = loadTestEnv();
  if (!serviceRoleKey) {
    throw new Error(
      "TEST_SUPABASE_SERVICE_ROLE_KEY is required in .env.test for fixture setup. It is only used from Node test code and must never be exposed to the browser."
    );
  }
  return createClient(env2.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
async function createTestUser(role, runId2 = currentTestRunId()) {
  assertSafeForDestructiveSetup();
  const testEnv = loadTestEnv();
  const preferred = testEnv.roles[role];
  const email = preferred.email ?? testEmailForRun(role, runId2);
  const password = preferred.password ?? `FreshGo-${runId2}`;
  const client = getServiceClient();
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { test_run_id: runId2, role }
  });
  if (error) {
    throw new Error(`createTestUser(${role}) failed: ${error.message}`);
  }
  const { error: roleError } = await client.from("user_roles").insert({ id: data.user.id, role });
  if (roleError) {
    throw new Error(`assignRole(${role}) failed: ${roleError.message}`);
  }
  return { id: data.user.id, email, password, role, runId: runId2 };
}

// e2e/verify.auth.ts
var failures = 0;
var pass = (m) => console.log("  \u2705 PASS: " + m);
var fail = (m) => {
  console.log("  \u274C FAIL: " + m);
  failures++;
};
var info = (m) => console.log("  \u2139  " + m);
function anonClient(env2) {
  return createClient2(env2.supabaseUrl, env2.supabaseAnonKey);
}
function asUser(env2, token) {
  return createClient2(env2.supabaseUrl, env2.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}
var roles = ["admin", "supplier", "delivery_rider", "customer"];
console.log("\n==== [1/6] Safety gate ====");
var env = loadTestEnv();
try {
  assertSafeSupabaseUrl(env.supabaseUrl);
} catch (e) {
  fail(`assertSafeSupabaseUrl threw: ${e.message}`);
  console.log("\nFATAL: production safety gate refused to continue. Aborting.");
  console.log("RESULT: " + (failures === 0 ? "PASS" : "FAIL") + " (aborted at gate)");
  process.exit(1);
}
if (!env.supabaseAnonKey) {
  fail("VITE_SUPABASE_ANON_KEY missing in .env.test");
  process.exit(1);
}
if (!env.serviceRoleKey) {
  fail("TEST_SUPABASE_SERVICE_ROLE_KEY missing in .env.test (required for createUser)");
  process.exit(1);
}
var isProd = env.supabaseUrl ? PRODUCTION_SUPABASE_URLS.map((u) => u.replace(/\/+$/, "")).includes(env.supabaseUrl.replace(/\/+$/, "")) : false;
console.log(`  url=${env.supabaseUrl}`);
if (isProd) {
  fail("Refusing: configured URL is a known production project");
  process.exit(1);
}
pass("supabaseUrl present and NOT a known production project");
pass("VITE_SUPABASE_ANON_KEY and TEST_SUPABASE_SERVICE_ROLE_KEY both configured");
var svc = createClient2(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
console.log("\n==== [2/6] Migration 20260824 applied? ====");
{
  let applied = null;
  let appliedErr = "";
  const r = await svc.from("supabase_migrations.schema_migrations").select("version").eq("version", "20260824000000").maybeSingle();
  if (r.error) {
    appliedErr = r.error.message;
    info(`schema_migrations read unavailable (${String(r.error.message).slice(0, 80)}); will infer from anon SELECT in step 5`);
    applied = null;
  } else {
    applied = !!r.data;
  }
  if (applied === true) pass("migration 20260824000000_site_settings_rls IS applied");
  else if (applied === false) fail("migration 20260824000000_site_settings_rls is NOT applied (RLS checks below will reflect old state)");
  else info("migration 20260824000000 apply-status undetermined from schema_migrations; relying on behavior tests");
}
console.log("\n==== [3/6] Create the four scoped test users (existing fixture) ====");
var runId = currentTestRunId();
info("runId = " + runId);
var created = {};
for (const role of roles) {
  try {
    const u = await createTestUser(role, runId);
    created[role] = { id: u.id, email: u.email, password: u.password };
    console.log(`  created ${role}: id=${u.id.slice(0, 8)}\u2026 email=${u.email} (password is run-scoped secret, not printed)`);
    pass(`createTestUser(${role}) succeeded`);
  } catch (e) {
    fail(`createTestUser(${role}) failed: ${e.message}`);
  }
}
async function signIn(role) {
  const c = anonClient(env);
  const { data, error } = await c.auth.signInWithPassword({ email: created[role].email, password: created[role].password });
  if (error || !data.session) {
    fail(`signIn(${role}) failed: ${error?.message}`);
    return null;
  }
  return data.session.access_token;
}
console.log("\n==== [4/6] Each user authenticates + has exactly the intended role ====");
var tokens = {};
var roleRows = {};
for (const role of roles) {
  const token = await signIn(role);
  tokens[role] = token;
  if (!token) continue;
  pass(`signIn(${role}) -> authenticated (access token obtained)`);
  const authed = asUser(env, token);
  const me = await authed.auth.getUser();
  const uid = me.data.user?.id;
  if (!uid) {
    fail(`getUser(${role}) returned no user`);
    continue;
  }
  const { data: ur, error: ure } = await authed.from("user_roles").select("role").eq("id", uid).maybeSingle();
  if (ure) {
    fail(`user_roles read(${role}) error: ${ure.message}`);
    continue;
  }
  const got = ur?.role;
  roleRows[uid] = got ?? "";
  if (got === role) pass(`user_roles[${role}] = '${role}' (exactly the intended role)`);
  else fail(`user_roles[${role}] = '${got}' (expected '${role}')`);
}
console.log("\n==== [5/6] Admin/supplier/rider recognition via is_*() RPCs ====");
async function rpcTruth(token, fn) {
  if (!token) return "n/a";
  const c = asUser(env, token);
  const { data, error } = await c.rpc(fn);
  if (error) {
    const msg = String(error.message ?? "").toLowerCase().includes("function") ? "n/a" : false;
    return msg;
  }
  return Boolean(data);
}
var adminTok = tokens.admin;
var supTok = tokens.supplier;
var riderTok = tokens.delivery_rider;
var custTok = tokens.customer;
var adm = await rpcTruth(adminTok, "is_admin");
var supSup = await rpcTruth(supTok, "is_supplier");
var riderRider = await rpcTruth(riderTok, "is_delivery_rider");
if (adm === true) pass("is_admin() = true for admin");
else fail(`is_admin() for admin = ${adm} (expected true)`);
if (supSup === true) pass("is_supplier() = true for supplier");
else fail(`is_supplier() for supplier = ${supSup} (expected true)`);
if (riderRider === true) pass("is_delivery_rider() = true for delivery_rider");
else fail(`is_delivery_rider() for delivery_rider = ${riderRider} (expected true)`);
var admSup = await rpcTruth(supTok, "is_admin");
var admRider = await rpcTruth(riderTok, "is_admin");
var admCust = await rpcTruth(custTok, "is_admin");
var supCust = await rpcTruth(custTok, "is_supplier");
var riderCust = await rpcTruth(custTok, "is_delivery_rider");
if (admSup === false) pass("is_admin() = false for supplier");
else fail(`is_admin() for supplier = ${admSup} (expected false)`);
if (admRider === false) pass("is_admin() = false for delivery_rider");
else fail(`is_admin() for rider = ${admRider} (expected false)`);
if (admCust === false) pass("is_admin() = false for customer");
else fail(`is_admin() for customer = ${admCust} (expected false)`);
if (supCust === false) pass("is_supplier() = false for customer");
else fail(`is_supplier() for customer = ${supCust} (expected false)`);
if (riderCust === false) pass("is_delivery_rider() = false for customer");
else fail(`is_delivery_rider() for customer = ${riderCust} (expected false)`);
var uidCust = tokens.customer ? await (async () => {
  const c = asUser(env, tokens.customer);
  const m = await c.auth.getUser();
  return m.data.user?.id ?? null;
})() : null;
if (uidCust && roleRows[uidCust] === "customer") pass('customer is recognized: user_roles.role = "customer" (app default) and is_admin/is_supplier/is_delivery_rider all false');
else if (uidCust) fail(`customer user_roles.role = '${roleRows[uidCust]}' (expected 'customer')`);
console.log("\n==== [6/6] site_settings RLS access ====");
var anon = anonClient(env);
{
  const { data, error } = await anon.from("site_settings").select("key,value").limit(5);
  if (error) fail(`anon SELECT site_settings FAILED: ${error.message} (likely migration 20260824 NOT applied)`);
  else {
    if (Array.isArray(data)) pass(`anon SELECT site_settings OK (${data.length} rows)`);
    else pass("anon SELECT site_settings OK (no rows)");
  }
}
var cust = tokens.customer ? asUser(env, tokens.customer) : null;
var probeKey = "rls_probe_" + runId;
if (cust) {
  const { error: ie } = await cust.from("site_settings").insert({ key: probeKey, value: "{}" });
  if (ie) pass(`customer INSERT denied (${String(ie.message).slice(0, 60)})`);
  else {
    fail("customer INSERT was ALLOWED (RLS not enforcing admin-only write)");
  }
  const { error: ue } = await cust.from("site_settings").update({ value: "{}" }).eq("key", "max_orders_per_day");
  if (ue) pass(`customer UPDATE denied (${String(ue.message).slice(0, 60)})`);
  else {
    fail("customer UPDATE was ALLOWED");
  }
  const { error: de } = await cust.from("site_settings").delete().eq("key", "max_orders_per_day");
  if (de) pass(`customer DELETE denied (${String(de.message).slice(0, 60)})`);
  else {
    fail("customer DELETE was ALLOWED");
  }
  await cust.from("site_settings").delete().eq("key", probeKey);
}
var admClient = tokens.admin ? asUser(env, tokens.admin) : null;
if (admClient) {
  const { data: cur, error: qe } = await admClient.from("site_settings").select("value").eq("key", "max_orders_per_day").maybeSingle();
  if (qe) {
    fail(`admin could not read max_orders_per_day (${qe.message})`);
  } else {
    const payload = cur && cur.value;
    const { error: ue } = await admClient.from("site_settings").update({ value: payload }).eq("key", "max_orders_per_day");
    if (ue) fail(`admin UPDATE site_settings FAILED: ${ue.message}`);
    else pass("admin UPDATE site_settings OK (UPDATE privilege present; payload identical -> no data change)");
  }
}
console.log("\n==== RESULT ====");
console.log(`FAILURES: ${failures}`);
console.log(failures === 0 ? "ALL CHECKS PASS" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
