# Launch authentication setup

The app sends customers to `/auth/redirect` after Google sign-in or email
verification. Provider credentials and mail settings are intentionally not
stored in this repository.

## 1. Enable verified email sign-up in Supabase

1. Open the production project in Supabase Dashboard.
2. Go to **Authentication → Providers → Email** and enable **Confirm email**.
3. Go to **Authentication → URL Configuration**.
4. Set **Site URL** to `https://app.freshgo.my`.
5. Add these exact redirect URLs under **Redirect URLs**:
   - `http://localhost:5173/auth/redirect`
   - `https://app.freshgo.my/auth/redirect`
6. Before launch, configure a production mail sender at **Authentication →
   Email Templates / SMTP** so verification messages are reliably delivered.
   Keep the confirmation email link as `{{ .ConfirmationURL }}`. If the
   template was customised to build a link from `{{ .SiteURL }}`, update it to
   use `{{ .RedirectTo }}` so the app's `/auth/redirect` route is retained.

The Pages project hostname is useful for deployment diagnostics, but it is not
the production auth origin. Keep `http://localhost:5173` for development. Add
an additional `/auth/redirect` URL only for a stable preview or staging origin
that the team deliberately uses for authentication tests; do not add every
ephemeral preview URL. The Google **Authorized redirect URI** remains
Supabase's callback URL; do not replace it with an app or Pages URL.

## 2. Enable Google sign-in

1. In Google Cloud Console, create or select the production OAuth consent
   screen and create a **Web application** OAuth client.
2. Under **Authorized JavaScript origins**, add `http://localhost:5173` and
   `https://app.freshgo.my`.
3. In that client's **Authorized redirect URIs**, add the Supabase callback
   shown by **Supabase Dashboard → Authentication → Providers → Google**. It
   has this exact form:
   `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
4. In Supabase Dashboard, go to **Authentication → Providers → Google**,
   enable Google, then paste the Google client ID and client secret there.
   Do not put either value in `.env`, source code, or Git.
5. Confirm the redirect URLs from step 1 are still present in **URL
   Configuration**, then test one local and one production Google sign-in.

## 3. Apply the privacy-consent gate migration

Apply `20261112000000_google_oauth_privacy_consent_gate.sql` before enabling
Google. It records a **not accepted** privacy state for a new Google identity,
then blocks checkout at the database until the customer accepts FreshGo's
Privacy Notice in the app. Email/password registrations keep their existing
required-consent flow unchanged.

## Launch checks

- Email sign-up shows a verification message and does not rely on an immediate session.
- An unverified email/password login asks the customer to verify first.
- A first-time Google login opens the FreshGo consent page; a returning user
  with the current accepted policy goes directly to the intended page.
- A customer without a current accepted policy cannot place an order, even if
  they attempt to open checkout directly.
- Confirm a local sign-in returns to `http://localhost:5173/auth/redirect` and
  production sign-in returns to `https://app.freshgo.my/auth/redirect`.
