-- Forms can be scoped to a registration mode: a "single" form shown when a
-- respondent registers only themself, or a "family" form shown for family
-- (group) registrations. NULL keeps the legacy behavior — a generic form
-- used as the fallback for both modes via participant_types.form_id.
alter table public.forms
  add column if not exists registration_mode text
  check (registration_mode is null or registration_mode in ('single', 'family'));

-- At most one single-mode and one family-mode form per event.
create unique index if not exists forms_event_registration_mode_key
  on public.forms (event_id, registration_mode)
  where registration_mode is not null;
