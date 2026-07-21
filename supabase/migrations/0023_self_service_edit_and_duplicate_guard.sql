-- Self-service registration editing + duplicate-registration guard.
--
-- 1. submit_registration refuses a second registration for the same event by
--    the same account while an earlier one still has a non-cancelled
--    participant. Event team members with the add-registrants privilege and
--    global-role holders are exempt (they register walk-ins on behalf of
--    others), matching has_event_privilege but keyed on v_uid because the
--    RPC runs under the service role where auth.uid() is null.
--    Also refuses registrations for soft-deleted events (0018).
--
-- 2. update_own_participant lets the person who submitted a registration
--    edit a participant's name/email/answers while the event's registration
--    window is still open. Answers are validated in /api/my/participants
--    with the same shared engine registration uses; this RPC re-checks
--    ownership and the window server-side so a direct call can't bypass it.

create or replace function public.submit_registration(
  p_event_id uuid,
  p_locale text,
  p_participants jsonb,
  p_registered_by uuid default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_registered_by, auth.uid());
  v_event events%rowtype;
  v_registration_id uuid;
  v_p jsonb;
  v_type participant_types%rowtype;
  v_status participant_status;
  v_confirmed_for_type integer;
  v_confirmed_for_event integer;
  v_new_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_group record;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = v_uid) then
    raise exception 'unknown registrant';
  end if;
  if jsonb_typeof(p_participants) <> 'array' or jsonb_array_length(p_participants) = 0 then
    raise exception 'no participants supplied';
  end if;
  if jsonb_array_length(p_participants) > 25 then
    raise exception 'too many participants in one registration';
  end if;

  select * into v_event from events where id = p_event_id;
  if not found or v_event.status <> 'published' or v_event.deleted_at is not null then
    raise exception 'event not open for registration';
  end if;
  if v_event.registration_opens_at is not null and now() < v_event.registration_opens_at then
    raise exception 'registration has not opened yet';
  end if;
  if v_event.registration_closes_at is not null and now() > v_event.registration_closes_at then
    raise exception 'registration is closed';
  end if;

  -- One registration per account per event: block a second submission while
  -- an earlier one still has a non-cancelled participant. Organizer-side
  -- registrars (add-registrants privilege or a global role) are exempt.
  if exists (
       select 1
       from registrations r
       join participants p on p.registration_id = r.id
       where r.event_id = p_event_id
         and r.registered_by = v_uid
         and p.status <> 'cancelled'
     )
     and not exists (
       select 1 from event_organizers m
       join event_roles er on er.id = m.role_id
       where m.event_id = p_event_id
         and m.user_id = v_uid
         and m.status = 'active'
         and er.can_add_registrants
     )
     and not exists (select 1 from user_roles ur where ur.user_id = v_uid)
  then
    raise exception 'already registered for this event';
  end if;

  -- Per-type payload limits (previously client-side only).
  for v_group in
    select (x->>'participant_type_id')::uuid as tid, count(*) as n
    from jsonb_array_elements(p_participants) x
    group by 1
  loop
    select * into v_type from participant_types
      where id = v_group.tid and event_id = p_event_id;
    if not found then
      raise exception 'invalid participant type';
    end if;
    if v_type.max_per_registration is not null and v_group.n > v_type.max_per_registration then
      raise exception 'too many participants of type %', v_type.key;
    end if;
    if v_type.min_per_registration > 0 and v_group.n < v_type.min_per_registration then
      raise exception 'too few participants of type %', v_type.key;
    end if;
  end loop;

  -- Serialize concurrent submissions: lock involved type rows in id order,
  -- then the event row when event-wide capacity applies.
  perform 1 from participant_types
    where id in (
      select distinct (x->>'participant_type_id')::uuid
      from jsonb_array_elements(p_participants) x
    )
    order by id
    for update;
  if v_event.capacity is not null then
    perform 1 from events where id = p_event_id for update;
  end if;

  insert into registrations (event_id, registered_by, locale)
  values (p_event_id, v_uid, coalesce(p_locale, 'en'))
  returning id into v_registration_id;

  for v_p in select * from jsonb_array_elements(p_participants) loop
    select * into v_type from participant_types
      where id = (v_p->>'participant_type_id')::uuid and event_id = p_event_id;
    if not found then
      raise exception 'invalid participant type';
    end if;
    -- The answered form version must be a published version of one of THIS
    -- event's forms (the type's own form or a mode-scoped single/family form).
    if not exists (
         select 1 from form_versions fv
         join forms f on f.id = fv.form_id
         where fv.id = (v_p->>'form_version_id')::uuid
           and f.event_id = p_event_id
           and fv.published_at is not null
       ) then
      raise exception 'invalid form version for participant type %', v_type.key;
    end if;
    select count(*) into v_confirmed_for_type
      from participants
      where participant_type_id = v_type.id and status = 'confirmed';
    select count(*) into v_confirmed_for_event
      from participants
      where event_id = p_event_id and status = 'confirmed';

    if (v_type.capacity is not null and v_confirmed_for_type >= v_type.capacity)
       or (v_event.capacity is not null and v_confirmed_for_event >= v_event.capacity) then
      v_status := 'waitlisted';
    else
      v_status := 'confirmed';
    end if;

    insert into participants (
      registration_id, event_id, participant_type_id, form_version_id,
      status, first_name, last_name, email, answers, waitlisted_at
    ) values (
      v_registration_id, p_event_id, v_type.id,
      (v_p->>'form_version_id')::uuid,
      v_status,
      trim(coalesce(v_p->>'first_name', '')), trim(coalesce(v_p->>'last_name', '')), nullif(trim(coalesce(v_p->>'email', '')), ''),
      coalesce(v_p->'answers', '{}'::jsonb),
      case when v_status = 'waitlisted' then now() end
    ) returning id into v_new_id;

    v_results := v_results || jsonb_build_object(
      'participant_id', v_new_id,
      'first_name', trim(coalesce(v_p->>'first_name', '')),
      'status', v_status
    );
  end loop;

  return jsonb_build_object('registration_id', v_registration_id, 'participants', v_results);
end;
$$;

-- Re-assert grants (create or replace preserves them, but be explicit).
revoke execute on function public.submit_registration(uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.submit_registration(uuid, text, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Self-service participant editing while registration is open.
-- ---------------------------------------------------------------------------
create or replace function public.update_own_participant(
  p_participant_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_answers jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_p participants%rowtype;
  v_event events%rowtype;
begin
  select * into v_p from participants where id = p_participant_id;
  if not found then
    raise exception 'participant not found';
  end if;
  if not exists (
    select 1 from registrations r
    where r.id = v_p.registration_id and r.registered_by = auth.uid()
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_p.status = 'cancelled' then
    raise exception 'participant is cancelled';
  end if;

  select * into v_event from events where id = v_p.event_id;
  if not found or v_event.status <> 'published' or v_event.deleted_at is not null then
    raise exception 'event not open for changes';
  end if;
  if v_event.registration_opens_at is not null and now() < v_event.registration_opens_at then
    raise exception 'registration has not opened yet';
  end if;
  if v_event.registration_closes_at is not null and now() > v_event.registration_closes_at then
    raise exception 'registration is closed';
  end if;

  update participants
  set first_name = trim(coalesce(p_first_name, '')),
      last_name = trim(coalesce(p_last_name, '')),
      email = nullif(trim(coalesce(p_email, '')), ''),
      answers = coalesce(p_answers, '{}'::jsonb)
  where id = p_participant_id;
end;
$$;
revoke execute on function public.update_own_participant(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.update_own_participant(uuid, text, text, text, jsonb) to authenticated;
