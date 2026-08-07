-- Machine-translated platform UI text, cached per language.
--
-- The registration flow mixes two kinds of text, and only one of them was ever
-- translated for an organizer-added language:
--
--   event text     the event name, participant type names, question labels,
--                  section headings — authored per event, stored in locale maps
--                  on `events` / `form_versions`, translated per event by the
--                  existing pipeline. This already worked.
--   platform text  "Next", "Single registration", "First name", "Country code",
--                  "This field is required" — authored by us, identical for
--                  every event, living in `messages/{locale}.json`.
--
-- Platform text exists only in the five locales we ship. A built-in language is
-- fine: it owns a route (`/es/...`), so next-intl resolves it. A custom language
-- cannot be a route — it rides `?lang=th` on the current route locale (see
-- lib/url.js) — so the reader got Thai event text wrapped in English chrome.
--
-- This table holds one row per language: the platform text machine-translated
-- into it, once, for the whole platform. Two consequences worth stating:
--
--   * It is NOT per-event. Thai "Next" is the same for every event, so the
--     hundredth event to offer Thai reads the row the first one paid for and
--     costs nothing. Seeding the strings into each event's page_content — the
--     approach 0036-era work used for the event page's own content fields —
--     would instead store one identical copy per event, forever.
--   * It grows with the number of distinct LANGUAGES, not with usage. The
--     ceiling is Google's supported list (~190); at roughly 6 KB of JSON per
--     language (measured: 3.9 KB for Latin scripts, 5.8 KB for Cyrillic) the
--     whole table maxes out around 2 MB no matter how many events exist.
--
-- Only the namespaces an attendee can actually see are cached. The `console`
-- namespace is 558 of the catalog's 758 keys and is read only by organizers,
-- who work in a platform locale — translating it would quadruple the cost and
-- the storage to no end. lib/i18n/ui-messages.js owns that list.

create table ui_translations (
  -- A language code from Google's supported list, as organizer-added languages
  -- always are. Not constrained to LOCALES: the five platform locales are
  -- hand-translated in the repo and must never be served from here.
  code text primary key check (code ~ '^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$'),
  -- Partial message tree, same shape as messages/{locale}.json but holding only
  -- the attendee namespaces, and within those only keys that translated cleanly.
  -- Merged OVER the route locale's catalog at render time, so a missing key
  -- falls back to today's behaviour rather than rendering blank.
  messages jsonb not null default '{}',
  -- Flat "namespace.key" → hash of the ENGLISH source the cached text was made
  -- from, mirroring the `_mt` provenance stamps in lib/form-localization.js.
  -- Rewording a string in messages/en.json changes its hash, which marks that
  -- one key stale so a refresh re-translates it and leaves the rest alone.
  source_hashes jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  -- Who triggered the run. Nullable: rows may also be written by a backfill.
  updated_by uuid references auth.users(id)
);

create trigger touch_ui_translations before update on ui_translations
  for each row execute function private.touch_updated_at();

alter table ui_translations enable row level security;

-- Readable by everyone, anon included: the public event page renders through
-- getSupabaseAnonClient() and needs the same chrome. There is nothing sensitive
-- here — it is our own UI text, already public in the JS bundle.
create policy ui_translations_select on ui_translations for select to anon, authenticated
  using (true);

-- No INSERT/UPDATE policy for ordinary users, deliberately. Writing costs money
-- (a Google Translate call), so the only write path is /api/ui-translations,
-- which authenticates the caller, rate-limits, and then writes with the service
-- role — the same shape as /api/register and submit_registration. Admins keep a
-- direct path for backfills and manual correction.
create policy ui_translations_write on ui_translations for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());
