-- Per-user date/time display preferences + one-time welcome flag.
--
-- 'auto' follows the UI language (today's behaviour); explicit values force
-- digit order / clock. onboarded_at marks that the user has seen the one-time
-- welcome dialog (name, language, formats); null = show it once.

alter table profiles
  add column if not exists date_format text not null default 'auto'
    check (date_format in ('auto', 'dmy', 'mdy', 'ymd')),
  add column if not exists time_format text not null default 'auto'
    check (time_format in ('auto', 'h12', 'h24')),
  add column if not exists onboarded_at timestamptz;
