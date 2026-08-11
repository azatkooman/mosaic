-- Per-organizer preference: warn before leaving a console editor with work
-- that is not saved (or, in the form builder, not published).
--
-- Default TRUE, and not null, so the guard is on for everyone including the
-- rows that already exist — the warning is the safe behaviour, and an organizer
-- who finds it tiresome can turn it off, which is the whole point of the
-- column. Turning it off is a real preference, not a mistake: someone who saves
-- constantly, or who works in short bursts across tabs, gets nothing from a
-- dialog they always dismiss.
--
-- No policy change: profiles_update (0002, tightened in 0039) already lets a
-- user update their own row and nobody else's, and this column needs exactly
-- that. It is also readable by the same profiles_select that already exposes
-- preferred_locale, theme and the date/time format preferences.

alter table profiles
  add column if not exists warn_unsaved_changes boolean not null default true;

comment on column profiles.warn_unsaved_changes is
  'Show the leave-without-saving confirmation in the console editors.';
