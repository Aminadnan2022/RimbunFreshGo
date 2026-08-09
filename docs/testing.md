# FreshGo Automated Testing

This document defines the testing environment, safety rules, and fixture
infrastructure for the FreshGo Playwright E2E suite.

---

## 1. Production environment

- **Live Supabase project:** `https://zcfpdmjjmihhhvtuwngii.supabase.co`
- Configured in the git-ignored `.env` file via:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- This project hosts real customer, supplier, rider, admin and order data.
  It is **production** and must **never** be used for destructive automated
  tests.

> The hardened URL list used by the safety guard lives in
> `e2e/support/env.ts` (`PRODUCTION_SUPABASE_URLS`). If the production project
> ever changes, update that list.

## 2. Test environment

FreshGo uses a **separate Supabase project dedicated to testing** (never the
production project).

- Config file: git-ignored `.env.test` (template: `.env.test.example`).
- Playwright loads `.env.test` via `e2e/support/env.ts` and seeds the Vite
  dev server it starts so `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` point
  at the test project **without modifying** `.env`.
- Destructive fixture setup additionally requires the Node-only
  `TEST_SUPABASE_SERVICE_ROLE_KEY`.

Playwright scripts:
- `npm run test:e2e` — run all E2E tests
- `npm run test:e2e:ui` — run with the interactive Playwright UI
- `npm run test:e2e:headed` — run headed

## 3. Required environment variables

| Variable | Where | Used by | Notes |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | `.env.test` | Vite app served to tests | TEST project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env.test` | Vite app served to tests | TEST project anon key |
| `TEST_SUPABASE_SERVICE_ROLE_KEY` | `.env.test` | Node fixture code only | optional; NEVER `VITE_`-prefixed, never browser-facing |
| `PLAYWRIGHT_BASE_URL` | env or `.env.test` | Playwright | default `http://localhost:5173` |
| `TEST_RUN_ID` | `.env.test` (optional) | fixtures | pin a run id; auto-generated otherwise |
| `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` | `.env.test` (optional) | fixture overrides | see §6 |
| `TEST_CUSTOMER_EMAIL` / `TEST_CUSTOMER_PASSWORD` | `.env.test` (optional) | fixture overrides | see §6 |
| `TEST_SUPPLIER_EMAIL` / `TEST_SUPPLIER_PASSWORD` | `.env.test` (optional) | fixture overrides | see §6 |
| `TEST_RIDER_EMAIL` / `TEST_RIDER_PASSWORD` | `.env.test` (optional) | fixture overrides | see §6 |

Production `.env` values are never used for tests and are never committed.

## 4. Creating / configuring the test Supabase project — MANUAL SETUP REQUIRED

A fresh, empty Supabase project must be created in the Supabase dashboard.
This cannot be automated from this repository today because no
`supabase/config.toml` or service-level credentials exist here.

1. Go to https://supabase.com/dashboard → **New project**.
   - Pick a name clearly marked as test, e.g. `freshgo-test-<yourname>`.
   - Choose a region near the team; any password can be wiped after migration.
2. From **Project Settings → API** copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** → `VITE_SUPABASE_ANON_KEY`
   - **service_role** (careful) → `TEST_SUPABASE_SERVICE_ROLE_KEY`
3. Put these into `.env.test` (copy from `.env.test.example`).
4. Apply the database schema (next section).
5. Optionally set fixed credentials for test users (section 6), or leave blank.

> Never enter the production project URL/keys into `.env.test`.

## 5. Applying the existing migrations to the test project

The repository contains the full schema history under `supabase/migrations/`
(43+ files, ordered by timestamp prefix). The test project must receive the
same schema.

Two options (nothing is automated yet):

1. **Recommended — Supabase CLI (long-term):** once `supabase/config.toml` is
   generated and linked, run:
   ```bash
   npx supabase link --project-ref <TEST_PROJECT_REF>
   npx supabase db push
   ```
2. **Manual backup-restore:** from an existing healthy test/staging project or
   a non-destructive SQL dump, restore into the new project and verify the
   schema (`user_roles`, `"Orders"`, `delivery_batches`, RLS policies, SECURITY
   DEFINER RPCs, triggers such as `enforce_order_capacity`).

**Current limitation:** there is no `supabase/config.toml` in this repository
(raw confirmed earlier), so the CLI workflows cannot run until that file is
generated (typically `npx supabase init`). Until then, schema setup is manual.

Migrations are **never** run automatically against production.

## 6. Configuring test users

FreshGo resolves roles from the `user_roles` table (`admin`, `supplier`,
`delivery_rider`, `customer`), which `src/context/AuthContext.tsx` reads on
login. The fixture helper `createTestUser(role)` in `e2e/support/fixtures.ts`:

1. Calls `auth.admin.createUser` (service role) using `TEST_*_EMAIL` /
   `TEST_*_PASSWORD` when set, otherwise a run-scoped generated email
   (`<role>.<runId>@example.com`).
2. Inserts the role into `user_roles`.
3. Records `user_metadata.test_run_id` = run id for scoped cleanup.

Credentials are supplied via environment variables only. No user is created in
production; the guard refuses to run unless `.env.test` points at a non-
production project.

## 7. Running Playwright

```bash
npm run test:e2e         # headless, Chromium
npm run test:e2e:ui      # debug UI
npm run test:e2e:headed  # headed Chrome
```

The current suite is intentionally small while the test environment is not yet
created:
- `e2e/smoke.spec.ts` — app boots; header/nav render (non-destructive).
- `e2e/guard.spec.ts` — production safety guard behaves correctly (pure, no DB).

## 8. Production safety rules

- **Never** run destructive tests against `https://zcfpdmjjmihhvtuwngii.supabase.co`
  or any URL in `PRODUCTION_SUPABASE_URLS`.
- The guard `e2e/support/safety.ts` (`assertSafeForDestructiveSetup()`)
  throws `"Refusing to run destructive E2E setup against the FreshGo production
  Supabase project."` whenever a fixture function is about to write while the
  configured Supabase URL is the production one.
- The guard is called **inside** every fixture helper, so a wrong `.env` can
  never silently reach production — the developer does not need to remember.
- The smoke test only loads the application; the guard spec never touches the
  browser or the database.

## 9. Data cleanup strategy

- **Unique run identifier:** every test run generates `TEST_RUN_ID`
  (e.g. `E2E-20260808-ABC123`); fixtures embed it in user metadata and in
  test-user emails.
- **Owned cleanup:** `cleanupTestRun(runId)` removes only records tagged with
  that run id (auth users via metadata/email match). It never issues
  `DELETE FROM "Orders";` or any table-wide delete.
- **Orders note:** future order fixtures must persist their run id onto the
  order (embedded in a run-scoped email/name) so cleanup filters by
  `Orders.user_id`/email of that run only. Orders referencing a run's users
  must be removed **before** deleting those users. No production schema
  changes are required for this.
- If a fixture is ever needed that cannot be tagged run-locally, that gap is
  documented here before merging, rather than disabling safe cleanup.

---

- **Production:** `.env`
- **Test:** `.env.test` (git-ignored), template `.env.test.example`
- **Guard:** `e2e/support/safety.ts`
- **Fixtures:** `e2e/support/fixtures.ts`