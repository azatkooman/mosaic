-- Duplicate an event for next year.
--
-- An RPC rather than a route doing six dependent inserts: the
-- forms → form_versions → participant_types graph needs an id map built as it
-- goes, and a half-cloned event (forms pointing at the source's versions, types
-- pointing at the source's forms) is exactly the failure class 0031/0033 guard
-- against. One transaction, or nothing.
--
-- What is NOT copied, and why:
--   * registrations / participants / participant_status_history — a new event
--     starts empty. This also means there is nothing to reset: registrations.seq
--     is computed per event as max(seq)+1 inside submit_registration, reg_seq and
--     member_index are derived at insert, and participants.ticket_code (0040) is
--     a per-row default under a UNIQUE index. An `insert into participants ...
--     select` that carried ticket_code across would blow that index — this
--     function must never touch the table.
--   * event_organizers — the on_event_created trigger grants the cloner their
--     own organizer role; copying the rest of the team is a separate decision.
--   * form version history — only the current published version of each form is
--     copied, renumbered to v1. History records what THOSE registrants answered
--     and means nothing on a new event.
--
-- Storage objects (cover images, page_content media) are SHARED, not copied:
-- the covers bucket is publicly readable so the clone renders, new uploads from
-- the clone's editor land under the new event id so the two diverge on first
-- edit, and neither delete_event (0018) nor purge_event (0036) touches storage,
-- so deleting the source cannot orphan the clone's images.

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
    insert into forms (event_id, title, registration_mode, creator_published)
    values (v_new_event_id, v_form.title, v_form.registration_mode, false)
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

-- Runs as the caller (auth.uid() is the new event's created_by), unlike the
-- service-role-only write RPCs where a route pre-authenticates.
revoke execute on function public.clone_event(uuid, text, jsonb) from public, anon;
grant execute on function public.clone_event(uuid, text, jsonb) to authenticated;
