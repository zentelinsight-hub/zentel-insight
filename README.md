# Zentel Insight

Production React/Vite website for **Zentel Insight** and the related **Zentel Insight StudyHub** experience.

Domain: `https://zentelinsight.com.ng`

Motto: **Inspiring Creativity, Empowering Minds.**

## Experiences

- Main public website: Home, About, Programs, Community, Contact, legal pages, login and signup.
- StudyHub: standalone `/studyhub` page with green brand accent `#04bf63`.
- Student portal: protected `/portal/*` routes for overview, programs, enrolments, payments, timetable, resources, announcements, profile, support and settings.

## Tech Stack

- React
- Vite
- React Router
- Supabase JavaScript client
- Supabase migrations and Edge Functions
- Paystack InlineJS
- Lucide React icons
- Plain CSS design tokens
- Vitest

## Local Setup

```bash
npm install
npm run dev
```

## Environment Variables

Create `.env.local` for local development. Do not commit it.

```env
VITE_SITE_URL=https://zentelinsight.com.ng
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me
VITE_PAYSTACK_PUBLIC_KEY=pk_test_replace_me
VITE_GOOGLE_SITE_VERIFICATION=
```

Browser-safe values only belong in Vite variables. Never place Paystack secret keys, Supabase service-role keys, database passwords or access tokens in frontend code.

## Supabase

Project reference:

```text
auzbmfwdxprtvjsvcxcj
```

Link and apply migrations:

```bash
npx supabase login
npx supabase link --project-ref auzbmfwdxprtvjsvcxcj
npx supabase db push
```

Configure the hosted OTP email template using [docs/supabase-email-template.md](./docs/supabase-email-template.md).

## Edge Functions

Deploy functions:

```bash
npx supabase functions deploy create-payment-session
npx supabase functions deploy verify-payment
npx supabase functions deploy paystack-webhook
npx supabase functions deploy delete-account
```

Set the server-only Paystack secret in Supabase:

```bash
npx supabase secrets set PAYSTACK_SECRET_KEY=sk_live_REPLACE_WITH_PRIVATE_SECRET
```

Do not put the real secret in Git, Vercel public variables or frontend code.

Paystack webhook URL after deployment:

```text
https://auzbmfwdxprtvjsvcxcj.supabase.co/functions/v1/paystack-webhook
```

Add that URL in the Paystack dashboard after deploying the function.

## Paystack

The frontend uses the public Paystack key only. Server verification requires the `verify-payment` Edge Function and `PAYSTACK_SECRET_KEY`.

The app must not label a transaction as server-verified until the server confirms it.

## Vercel

Set these Vercel environment variables:

```text
VITE_SITE_URL
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_PAYSTACK_PUBLIC_KEY
VITE_GOOGLE_SITE_VERIFICATION
```

Deploy with the included `vercel.json` SPA rewrite.

## Assets

Official brand JPG assets live here:

```text
public/brands/zentel-insight/
public/brands/studyhub/
```

The main platform uses `public/brands/zentel-insight/logo.jpg` and `public/brands/zentel-insight/favicon.jpg`.
StudyHub uses `public/brands/studyhub/logo.png` and `public/brands/studyhub/favicon.png`.

## Checks

```bash
npm run lint
npm test
npm run build
npm run preview
```

Do not run real Paystack charges in automated tests.

## Security Notes

- `.env`, `.env.*`, `.env.local`, `.vercel`, `node_modules`, `dist`, logs and coverage are ignored.
- Supabase service-role keys are used only in Edge Functions.
- Anonymous StudyHub customers should not query the payments table directly.
- Payment fulfilment is idempotent and belongs on the server.

## Owner Actions Before Launch

- Configure Supabase Site URL and redirect URLs.
- Configure the hosted Supabase OTP email template.
- Authenticate Supabase CLI and push migrations.
- Deploy Edge Functions.
- Set `PAYSTACK_SECRET_KEY` in Supabase.
- Add the Paystack webhook URL in the Paystack dashboard.
- Add Vercel environment variables.
- Connect the production domain.
