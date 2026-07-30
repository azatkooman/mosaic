# Mosaic

Event registration — conferences, camps and gatherings, with flexible
multilingual registration forms, group (family) registration, capacity +
waitlists, and an organizer console with filtering and Excel export.

**Stack:** Next.js 15 (App Router, JavaScript) on Vercel · Supabase (Postgres,
Auth, Storage) · next-intl (en, es, fr, ru, uk) · TanStack Query/Table ·
dnd-kit · exceljs.

## Local development

Prerequisites: Node 20+, Docker (for the local Supabase stack).

```bash
npm install
npx supabase start          # boots Postgres/Auth/Storage/PostgREST in Docker
npm run dev                 # http://localhost:3000
```

`npx supabase start` prints the local anon/service keys — put them in
`.env.local` (see `.env.example`). Migrations in `supabase/migrations/` and
`supabase/seed.sql` are applied automatically on start / `supabase db reset`.

Seeded dev accounts (local only):

| Email | Password | Role |
| --- | --- | --- |
| `admin@example.com` | `password123` | admin (sees the console) |
| `user@example.com` | `password123` | registrant |

The seed also publishes a sample event at `/en/events/summer-conference-2026`
with staff/student/child participant types and a conditional-logic form.

```bash
npm test                    # form-engine unit tests (vitest)
npm run build               # production build
```

## Architecture in one minute

- **Forms are JSON.** Each event's registration form lives in
  `form_versions.definition` — questions with localized labels, per-participant-type
  visibility, and conditional `visibleIf` rules. Published versions are
  immutable; editing clones a new draft (`create_draft_version` RPC) and
  publishing bumps `forms.current_version_id`. Participants record the version
  they answered.
- **One validation module.** `lib/form-engine/` (pure JS, no React) evaluates
  visibility and validates/prunes answers. The browser uses it for live
  errors; `/api/register` re-runs it server-side before calling the
  `submit_registration` RPC. Client and server can never disagree.
- **Capacity is enforced in Postgres.** `submit_registration` takes ordered
  row locks on the participant-type rows (and the event row for event-wide
  capacity), so concurrent submissions serialize — overselling is impossible.
  Cancellations auto-promote the oldest waitlisted participant (trigger).
- **RLS everywhere.** Published events + forms are readable anonymously;
  drafts only by their team; registrants see their own registrations;
  organizer/viewer roles are granted per event (`event_organizers`), with
  global `admin`/`organizer` roles in `user_roles`. There are **no INSERT
  policies** on registrations/participants — the RPC is the only write path.
- **Answers are JSONB** (`participants.answers`, GIN-indexed) — the console
  filters on arbitrary form answers straight through PostgREST, and
  `/api/export` flattens them into Excel/CSV columns with localized headers.

## Deployment

1. **Supabase**: create a project, then `npx supabase link --project-ref <ref>`
   and `npx supabase db push`. Configure auth providers (see
   `docs/auth-runbook.md`) and custom SMTP.
2. **Vercel**: import the repo. Env vars: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only),
   `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_OKTA_SSO_DOMAIN` (optional).
3. Add `https://<site>/{locale}/auth/callback` URLs to Supabase's redirect
   allowlist.

CI (`.github/workflows/ci.yml`) runs lint + tests + build on every PR, and
pushes migrations to staging on merge to `main` when `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD` secrets are set.

## Bootstrapping the first admin

After your first real sign-in, grant yourself admin in the SQL editor:

```sql
insert into user_roles (user_id, org_id, role)
select u.id, o.id, 'admin'
from auth.users u, organizations o
where u.email = 'you@example.org';
```

Admins can create events and add per-event organizers/viewers from the
console's Team tab.
