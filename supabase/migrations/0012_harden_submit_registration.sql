-- Harden submit_registration (audit findings):
--
-- 1. The RPC was granted to `authenticated`, so any signed-in user could call
--    it directly with the anon key and bypass every check in /api/register
--    (answer validation, per-type limits, name checks, file ownership).
--    It is now callable ONLY by service_role; /api/register is the sole
--    entry point and passes the verified user id as p_registered_by.
-- 2. min/max_per_registration were never enforced server-side.
-- 3. Empty-string participant names were accepted.

drop function if exists public.submit_registration(uuid, text, jsonb);

create function public.submit_registration(
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
  if not found or v_event.status <> 'published' then
    raise exception 'event not open for registration';
  end if;
  if v_event.registration_opens_at is not null and now() < v_event.registration_opens_at then
    raise exception 'registration has not opened yet';
  end if;
  if v_event.registration_closes_at is not null and now() > v_event.registration_closes_at then
    raise exception 'registration is closed';
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
    if v_type.form_id is null
       or not exists (
         select 1 from form_versions fv
         where fv.id = (v_p->>'form_version_id')::uuid
           and fv.form_id = v_type.form_id
           and fv.published_at is not null
       ) then
      raise exception 'invalid form version for participant type %', v_type.key;
    end if;
    if length(trim(coalesce(v_p->>'first_name', ''))) = 0
       or length(trim(coalesce(v_p->>'last_name', ''))) = 0 then
      raise exception 'participant name required';
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
      trim(v_p->>'first_name'), trim(v_p->>'last_name'), nullif(trim(coalesce(v_p->>'email', '')), ''),
      coalesce(v_p->'answers', '{}'::jsonb),
      case when v_status = 'waitlisted' then now() end
    ) returning id into v_new_id;

    v_results := v_results || jsonb_build_object(
      'participant_id', v_new_id,
      'first_name', trim(v_p->>'first_name'),
      'status', v_status
    );
  end loop;

  return jsonb_build_object('registration_id', v_registration_id, 'participants', v_results);
end;
$$;

-- Service-role only: /api/register is the single entry point, so the shared
-- JS validation (answers, visibility, file ownership) can never be bypassed.
revoke execute on function public.submit_registration(uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.submit_registration(uuid, text, jsonb, uuid) to service_role;
