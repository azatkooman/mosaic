-- Let an event default to any language it offers, not just the five built-ins.
--
-- Event languages are now managed as one list in Settings ("Available
-- Languages"), and the Default Language dropdown offers exactly that list. A
-- list that can contain organizer-picked codes ('tg', 'yo', …) is incompatible
-- with 0001's `check (default_locale in ('en','es','fr','ru','uk'))`, which
-- would reject the save.
--
-- The companion `check (name ? default_locale)` from 0001 stays: an event may
-- not default to a language whose name was never filled in. That is the
-- guardrail that keeps `lt()`'s fallback chain meaningful.
--
-- profiles.preferred_locale keeps its own check — that column picks the
-- platform UI language, which is still only translated into the five built-ins.

do $$
declare
  v_name text;
begin
  -- 0001 declares the constraint inline, so its name is assigned by Postgres.
  -- Match on the locale list rather than a hardcoded name: `name ? default_locale`
  -- also mentions the column and must survive.
  select conname into v_name
  from pg_constraint
  where conrelid = 'public.events'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%default_locale%'
    and pg_get_constraintdef(oid) like '%''uk''%';

  if v_name is not null then
    execute format('alter table public.events drop constraint %I', v_name);
  end if;
end $$;
