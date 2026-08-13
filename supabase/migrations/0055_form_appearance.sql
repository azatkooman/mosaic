-- Give each form somewhere to keep how it LOOKS, separate from what it ASKS.
--
-- Deliberately on `forms` and not in `form_versions.definition`, which is where
-- it would otherwise obviously go. The definition is versioned and immutable
-- once published: editing clones a draft (create_draft_version), publishing
-- moves forms.current_version_id, and participants.form_version_id (0001) pins
-- the exact version each registrant answered. Appearance in there would mean a
-- colour change mints a form version and needs a Publish to take effect — and
-- leaves a permanent v7-differs-from-v6-by-one-hex-code in the history of what
-- registrants were asked. It is not answer-affecting data and does not belong
-- on that clock.
--
-- Per form rather than per event so a single-registration form and a group form
-- can look different. `{}` means "inherit" — the resolver layers a form's own
-- settings over the event page's theme (events.page_content.theme), so a form
-- nobody has customized still matches the event it belongs to.
--
-- No RLS or grant work is needed and that is not an oversight: forms_update
-- (0002) is a whole-row policy gated on private.can_manage_event(event_id) with
-- no column list, and there are no column-level grants on the table, so the new
-- column is writable by exactly the people who can already edit the form.

alter table forms
  add column if not exists appearance jsonb not null default '{}'::jsonb;

comment on column forms.appearance is
  'How this form looks. Empty object = inherit the event page theme. Not in '
  'form_versions.definition on purpose: appearance is not versioned data and '
  'must not require publishing a new form version to change.';

-- clone_event has to be restated in full, because it inserts forms with an
-- explicit column list and PL/pgSQL bodies cannot be patched a statement at a
-- time. Without this the column is the only thing a duplicated event silently
-- loses: the clone renders in default styling while the source stays as the
-- organizer left it, with no error and nothing on screen to suggest why.
--
-- Identical to 0044 apart from `appearance` joining that list. See 0044 for the
-- reasoning on what is and is not copied.
create or replace function public.clone_event(
  p_source_event_id uuid,
  p_slug text,
  p_name jsonb default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_src events%rowtype;
  v_new_event_id uuid;
  v_form record;
  v_new_form_id uuid;
  v_src_version form_versions%rowtype;
  v_new_version_id uuid;
  v_found boolean;
  -- old form id (text) -> new form id (text)
  v_form_map jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_src from events
   where id = p_source_event_id and deleted_at is null;
  if not found then
    raise exception 'event not found';
  end if;

  -- Definer rights bypass RLS, so the policies this would otherwise skip are
  -- re-asserted here. Being able to manage the SOURCE is the whole gate:
  -- events_insert (0011) lets any authenticated user create an event, so
  -- demanding more than that would make cloning harder than starting fresh.
  if not private.can_manage_event(p_source_event_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid slug';
  end if;
  -- Distinguishable message so the dialog can say which field is wrong,
  -- instead of surfacing a raw 23505.
  if exists (select 1 from events where slug = p_slug) then
    raise exception 'slug already taken';
  end if;

  -- Dates are copied verbatim. Shifting them by a year would be a guess, and a
  -- silently wrong date is worse than an obviously stale one the organizer
  -- edits in Settings before publishing.
  insert into events (
    org_id, slug, status, name, description, location, timezone,
    starts_at, ends_at, registration_opens_at, registration_closes_at,
    capacity, cover_image_path, default_locale, supported_locales,
    created_by, contact, visibility, page_content, registration_manually_closed
  ) values (
    v_src.org_id, p_slug, 'draft',
    coalesce(p_name, v_src.name), v_src.description, v_src.location, v_src.timezone,
    v_src.starts_at, v_src.ends_at,
    v_src.registration_opens_at, v_src.registration_closes_at,
    v_src.capacity, v_src.cover_image_path, v_src.default_locale, v_src.supported_locales,
    v_uid, v_src.contact, v_src.visibility, v_src.page_content,
    -- A clone of a manually closed event must not start closed (0041).
    false
  )
  returning id into v_new_event_id;

  for v_form in select * from forms where event_id = p_source_event_id loop
    insert into forms (event_id, title, registration_mode, creator_published, appearance)
    values (v_new_event_id, v_form.title, v_form.registration_mode, false, v_form.appearance)
    returning id into v_new_form_id;

    -- The published version if there is one, else the latest draft, so a
    -- work-in-progress form clones as a work-in-progress form.
    v_found := false;
    if v_form.current_version_id is not null then
      select * into v_src_version from form_versions where id = v_form.current_version_id;
      v_found := found;
    end if;
    if not v_found then
      select * into v_src_version from form_versions
       where form_id = v_form.id
       order by version desc
       limit 1;
      v_found := found;
    end if;

    if v_found then
      insert into form_versions (form_id, version, definition, published_at, created_by)
      values (
        v_new_form_id, 1, v_src_version.definition,
        case when v_form.current_version_id is not null then now() else null end,
        v_uid
      )
      returning id into v_new_version_id;

      -- Only a form that was published on the source comes out published here,
      -- and creator_published rides along so the publish guard behaves the same.
      if v_form.current_version_id is not null then
        update forms
           set current_version_id = v_new_version_id,
               creator_published = v_form.creator_published
         where id = v_new_form_id;
      end if;
    end if;

    v_form_map := v_form_map || jsonb_build_object(v_form.id::text, v_new_form_id::text);
  end loop;

  -- form_id remapped through the map above; a type with no form stays null.
  insert into participant_types (
    event_id, key, name, capacity, min_per_registration, max_per_registration,
    form_id, min_age, max_age, rules, sort_order, hidden
  )
  select
    v_new_event_id, pt.key, pt.name, pt.capacity,
    pt.min_per_registration, pt.max_per_registration,
    (v_form_map ->> pt.form_id::text)::uuid,
    pt.min_age, pt.max_age, pt.rules, pt.sort_order, pt.hidden
  from participant_types pt
  where pt.event_id = p_source_event_id;

  return v_new_event_id;
end;
$$;

revoke execute on function public.clone_event(uuid, text, jsonb) from public, anon;
grant execute on function public.clone_event(uuid, text, jsonb) to authenticated;
