# Auth provider runbook

All providers are configured in the Supabase dashboard (Auth → Providers)
unless noted. The redirect/callback URL for every provider is:

```
https://<project-ref>.supabase.co/auth/v1/callback
```

## URL configuration (do this first)

Auth → URL Configuration in the dashboard. Getting this wrong does **not**
produce an error — Supabase quietly redirects to **Site URL** instead, so users
sign in successfully and land on the wrong page. That was the cause of the
"clicking Register makes me sign in, then dumps me back on the event page and I
have to click Register again" bug.

| Field | Value |
| --- | --- |
| Site URL | `https://mosaic.cru.org` |
| Redirect URLs | `https://mosaic.cru.org/*/auth/callback` |

Add a preview entry (`https://*-<org>.vercel.app/*/auth/callback`) if you test
auth on Vercel preview deployments. The local equivalents live in
`supabase/config.toml` under `additional_redirect_urls` — keep the two in sync.

The `*` covers the locale segment. Redirect URLs are matched against the
**whole** `redirectTo` value including its query string, which is why the app
never puts the post-login destination there: `LoginForm` stores it in the
short-lived `mosaic-auth-next` cookie and `/[locale]/auth/callback` reads it
back (see `AUTH_NEXT_COOKIE` in `lib/url.js`). Keep `redirectTo` bare so this
one allow-list entry keeps matching.

## Google

1. Google Cloud Console → create an OAuth 2.0 Client ID (type: Web application).
2. Authorized redirect URI: the Supabase callback above.
3. Paste client ID + secret into Supabase → Auth → Providers → Google.

## Apple

Requires a paid Apple Developer account ($99/yr).

1. Create an App ID with "Sign in with Apple" enabled.
2. Create a **Services ID** — this is the OAuth client ID.
3. Create a **Sign in with Apple key**; download the `.p8`.
4. Generate the client-secret JWT from the key (Supabase docs have a script).

> ⚠️ **The Apple client secret expires after at most 6 months.** Set a
> recurring calendar reminder to regenerate it — an expired secret is the
> classic "Apple login suddenly broken" outage.

## Okta (SAML SSO)

Supabase supports enterprise SSO via **SAML 2.0** on paid plans (Pro+ with the
SSO add-on — verify current plan gating before committing). Configuration is
CLI-only:

1. In Okta Admin: create a SAML 2.0 app with
   - ACS URL: `https://<project-ref>.supabase.co/auth/v1/sso/saml/acs`
   - Audience: `https://<project-ref>.supabase.co/auth/v1/sso/saml/metadata`
   - Attribute mapping: `email`, `firstName`, `lastName`.
2. Register the IdP with Supabase:

   ```bash
   npx supabase sso add --type saml \
     --metadata-url 'https://<okta-org>.okta.com/app/<app-id>/sso/saml/metadata' \
     --domains cru.org \
     --project-ref <project-ref>
   ```

3. Set `NEXT_PUBLIC_OKTA_SSO_DOMAIN=cru.org` in Vercel — this makes the
   "Continue with Okta" button appear on the login page
   (it calls `supabase.auth.signInWithSSO({ domain })`).

## Magic link (email)

- Enable the Email provider.
- **Configure custom SMTP** (Resend/Postmark) in Auth → SMTP. The built-in
  sender is rate-limited to a handful of emails per hour and is not
  production-viable.
- Localized emails: Supabase templates are single-language. For fully
  localized magic-link emails, attach a "Send Email" auth hook that renders
  by the user's `profiles.preferred_locale` (post-MVP).

## Account linking

Enable "link accounts with the same verified email" so a staff member who
signs in with Google one day and Okta the next lands in the same account.
Both providers assert verified `@cru.org` addresses, so this is safe here.
