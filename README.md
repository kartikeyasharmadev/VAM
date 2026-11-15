# EntryFlow

EntryFlow is a multi-organization visitor management starter. Coworking is the first example workspace, but the data model is designed around general organizations, locations, visitors, hosts, and visits so it can serve other venues too.

## Run the Next.js app on Windows

You have Node.js 22 and npm available. From PowerShell, in this folder:

```powershell
npm install
Copy-Item .env.example .env.local
```

Create a Supabase project, then open **Project Settings → API** (or the project Connect dialog). Put the Project URL and **publishable** key into `.env.local`. Keep any `service_role` or secret key out of this app and out of `NEXT_PUBLIC_*` variables.

In the Supabase dashboard:

1. Open **SQL Editor**, paste and run [`20261110000000_entryflow_core.sql`](supabase/migrations/20261110000000_entryflow_core.sql).
2. Then paste and run [`20261111000000_platform_admin_roles_branches.sql`](supabase/migrations/20261111000000_platform_admin_roles_branches.sql).
3. Then paste and run [`20261112000000_staff_onboarding_and_branch_visits.sql`](supabase/migrations/20261112000000_staff_onboarding_and_branch_visits.sql).
4. Then paste and run [`20261113000000_subscription_billing.sql`](supabase/migrations/20261113000000_subscription_billing.sql).
5. Then paste and run [`20261114000000_branch_staff_and_platform_access.sql`](supabase/migrations/20261114000000_branch_staff_and_platform_access.sql).
6. Then paste and run [`20261115000000_workspace_invitations.sql`](supabase/migrations/20261115000000_workspace_invitations.sql).
7. Then paste and run [`20261115000100_branch_scoped_visit_creation.sql`](supabase/migrations/20261115000100_branch_scoped_visit_creation.sql).
8. Then paste and run [`20261116000000_workspace_notifications.sql`](supabase/migrations/20261116000000_workspace_notifications.sql).
9. Then paste and run [`20261116000100_member_visit_requests.sql`](supabase/migrations/20261116000100_member_visit_requests.sql).
10. Then paste and run [`20261116000200_workspace_branding_billing_alerts.sql`](supabase/migrations/20261116000200_workspace_branding_billing_alerts.sql).
11. Then paste and run [`20261116000300_subscription_email_reminders.sql`](supabase/migrations/20261116000300_subscription_email_reminders.sql).
12. In **Authentication → URL Configuration**, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/confirm` to the redirect URL allow list.
13. Leave email confirmation enabled for real accounts. The app's callback verifies Supabase's confirmation link and accepts matching workspace invitations.
14. Save the same local address in `.env.local` as `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.

To enable Google sign-in, open **Authentication → Sign In / Providers → Google** in Supabase and enter a Google OAuth client ID and secret from Google Cloud Console. Add Supabase's callback URL (`https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`) to the authorized redirect URIs in Google Cloud. Keep `http://localhost:3000/auth/confirm` and your production app's `/auth/confirm` URL in Supabase's redirect URL allow list. OAuth client secrets belong in Supabase provider settings, never in the browser or `NEXT_PUBLIC_` variables.

To grant the first platform super-admin, create your normal app account and confirm its email. In **SQL Editor**, run this once, replacing the email with the exact email on that account:

```sql
insert into public.platform_admins (user_id)
select id from auth.users where lower(email) = lower('YOUR-LOGIN-EMAIL')
on conflict (user_id) do nothing;
```

This is intentionally an owner-only SQL action: platform administrators cannot grant themselves that status through the website. Sign out and back in after granting it, then open **Super admin** from the sidebar. Platform Super Admins can open customer workspaces and access all workspace data, including visitor records; Supabase RLS grants that access. Workspace admins manage staff, branches, and workspace branding. Branch-scoped roles limit front-desk access to assigned locations. Role changes apply to accounts that have already signed up and confirmed their email; admins can also invite staff by email.

The Supabase folder and `config.toml` are already scaffolded, so you do not need to run `supabase init` again. If you want to link the CLI from a machine with npm network access, run:

```powershell
npm install --save-dev supabase
npx supabase login
npx supabase link --project-ref epdroekyturydlwppbwt
npx supabase db push --dry-run --remote
```

After checking the dry-run output, apply the migration with `npx supabase db push --remote`. The link step may ask for the database password; press Enter to skip the optional password check. Do not paste the database connection string with `[YOUR-PASSWORD]` unchanged. You can also apply the migration directly in SQL Editor without CLI login or a database password.

Then start the development server:

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create an account, confirm it from your email, sign in, and create a workspace. The first account for that workspace becomes its admin. Add a visitor and use the visitor log to check them in or out.

The existing [`index.html`](index.html) remains the original local UI demo. The Next.js app is the product foundation and runs at `http://localhost:3000`.

## EntryFlow identity and subscriptions

The product name remains **EntryFlow**, with the tagline **“Arrivals, handled.”** The logo is a custom doorway-and-arrow mark in `src/components/brand.tsx`, with the matching browser icon in `src/app/icon.svg`. The refreshed interface uses a dark aubergine sidebar, lavender surfaces, and purple and pink accents.

The initial plans are Free (1 branch, 3 staff, 100 visits/month), Team (₹999/month, 5 branches, 20 staff, unlimited visits), and Business (₹2,499/month, unlimited branches, staff, and visits). These are the starting INR prices selected for this build. Create matching monthly recurring prices in Stripe; update the labels if you change the Stripe prices later.

To activate Stripe billing:

1. In Stripe **test mode**, create monthly recurring prices for Team and Business. Copy each `price_...` ID.
2. Enable Stripe's customer portal and allow customers to change/cancel subscriptions and update payment methods.
3. Copy `.env.example` to `.env.local` if needed. Fill in the Stripe test secret, webhook secret, price IDs, and Supabase secret key. The Supabase secret key is used only on the server for sending staff invitations and verified Stripe webhooks. Keep all secret values server-only; never put them in `NEXT_PUBLIC_` variables.
4. Restart Next.js, then open **Plan & billing** from the workspace dashboard to start Checkout.
5. For local webhook testing, install and run Stripe CLI and forward events to `http://localhost:3000/api/stripe/webhook`. Set the CLI's `whsec_...` signing secret as `STRIPE_WEBHOOK_SECRET`.
6. For deployment, register `https://YOUR-DOMAIN/api/stripe/webhook` in Stripe and subscribe to `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Put that endpoint's signing secret in the deployment environment.
7. Finish testing in Stripe test mode before switching to live keys or charging customers.

Checkout and billing portal sessions are created server-side. The webhook verifies Stripe's signature before updating organization subscription state. Supabase applies Free plan limits of 1 branch, 3 team members, and 100 visits per month; Team limits of 5 branches and 20 team members; and Business has no app limits. Paid limits apply only for active or trialing subscriptions. Stripe's hosted checkout and customer portal keep card handling out of EntryFlow; see Stripe's official [Checkout subscription guide](https://docs.stripe.com/payments/checkout/build-subscriptions) and [customer portal guide](https://docs.stripe.com/customer-management).

## Production deployment and reminders

The repository includes [`vercel.json`](vercel.json), which schedules [`/api/cron/subscription-reminders`](src/app/api/cron/subscription-reminders/route.ts) every day at 09:00 India time (03:30 UTC). Vercel Cron runs only on production deployments. It sends one renewal reminder when an active/trial subscription is within seven days of its billing period end, and a billing-attention email when the provider reports an expired or unhealthy subscription. Successful sends are recorded so daily retries do not resend the same reminder to the same workspace admin.

To deploy:

1. Push this repository to GitHub and import it into Vercel as a Next.js project.
2. In Vercel **Project Settings → Environment Variables**, add the values from `.env.example`. Use the production Supabase URL and publishable key, production `NEXT_PUBLIC_SITE_URL`, Supabase secret key, Stripe live keys and price IDs only after test mode is verified, and a long random `CRON_SECRET`.
3. Create a Resend account, verify a sender domain, then add `RESEND_API_KEY` and `EMAIL_FROM` (for example `EntryFlow Billing <billing@yourdomain.com>`). Configure SPF/DKIM records at your DNS provider as Resend instructs. Email reminders are skipped until both values are set; in-app alerts still work.
4. Apply all migrations in timestamp order. With the CLI, first compare `supabase migration list --linked`; then use `supabase db push` only when remote history matches this repository. If you applied SQL manually in Dashboard, continue there with the unapplied migration files to avoid history conflicts.
5. In Supabase **Authentication → URL Configuration**, set the production Site URL and allow `https://YOUR-DOMAIN/auth/confirm`. Set `NEXT_PUBLIC_SITE_URL` to the same production origin in Vercel.
6. Add `https://YOUR-DOMAIN/api/stripe/webhook` in Stripe with the subscription events listed above, then set its endpoint signing secret in Vercel.
7. Deploy to production. Confirm the cron appears in the Vercel project's **Cron Jobs** settings, and check function logs after its 09:00 IST run. You can invoke the endpoint manually with `Authorization: Bearer $CRON_SECRET` for a controlled check.

The cron does not suspend accounts or block visits; it sends reminders. Billing status changes also create in-app alerts for workspace admins and platform admins. Supabase Auth SMTP is separate: it delivers sign-in, confirmation, and invitation emails, while Resend here sends the app's subscription reminders.

## Organization-level isolation

Every customer-owned record has an `organization_id`. Row Level Security checks the signed-in Supabase Auth user against workspace membership and, for branch staff, `location_members`. Platform Super Admin access is separately allowlisted in `platform_admins` and enforced in SQL policies. Workspace admins can manage all branches in their workspace; assigned branch receptionists can see and handle visits only for their assigned locations. Organization creation, branch role changes, and visit creation use narrow SQL functions that validate identity and role.

The Next.js server uses Supabase's cookie-based SSR client. The browser receives only the publishable key. The server-only Supabase secret key is used for invitation emails and signed Stripe webhooks; it must never be exposed to the browser, placed in a `NEXT_PUBLIC_` variable, or used for ordinary tenant queries. Normal application reads and writes continue through the authenticated SSR client and database RLS policies.

## Current scope and before a pilot

Implemented: email/password and Google OAuth sign-in, email confirmation callback, first-admin workspace setup, organization membership, platform super-admin allowlist and overview, confirmed-account onboarding and email invitations, role-filtered navigation, branch-scoped access, member visitor requests with front-desk approval/rejection, in-app visitor/billing notifications, workspace-wide branding, scheduled subscription reminder emails, branch creation/removal, subscription plan display, Stripe Checkout and Billing Portal, signed Stripe webhooks, basic subscription limits, visitor log, check-in/check-out, and organization switching for multiple memberships.

Still needed before real visitor data or pilot use: push/SMS notification delivery, host-linked approvals, QR passes, rate limits, audit history, retention/deletion controls, backup/restore practice, production configuration, and a security/privacy review. Configure Supabase Auth's production email delivery before inviting pilot staff. A local app and RLS schema are a foundation, not a completed production security audit.

## Workspace commands

```powershell
npm run dev
npm run build
npm run start
npm run lint
```
