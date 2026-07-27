-- Registration numbers + registrant profile snapshot.
--
-- 1. Every registration gets a per-event sequential number (`registrations.seq`,
--    1, 2, 3… within an event) and every participant its 1-based position
--    inside that registration (`participants.member_index`). The console shows
--    them joined as "Reg. #" — `7.1`, `7.2`, `7.3` for a three-person family —
--    so the number is unique per row while still showing who registered
--    together. `seq` is denormalized onto participants as `reg_seq` so the
--    list can sort by it server-side without a join (the same reason the
--    filter/sort path in lib/participants-query stays single-table).
--
--    NOTE the display string is deliberately built from two integers rather
--    than stored as text: sorting is done on (reg_seq, member_index) so a
--    10-member family orders 7.9 before 7.10, which a decimal or text sort
--    would get wrong.
--
-- 2. `participants.profile_name` / `profile_email` snapshot the registrant's
--    profile at submission time. The participants list previously showed the
--    first_name/last_name/email columns derived from the form's name/email
--    questions, which are optional — so those columns were empty whenever the
--    organizer removed the questions, and duplicated the answer columns when
--    they kept them. The profile pair is always populated and records who
--    actually submitted, which is what an organizer needs when the form
--    itself asks for nothing identifying.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table registrations add column if not exists seq integer;

alter table participants
  add column if not exists reg_seq integer,
  add column if not exists member_index integer,
  add column if not exists profile_name text,
  add column if not exists profile_email text;

-- ---------------------------------------------------------------------------
-- Backfill: number existing registrations per event in submission order.
-- ---------------------------------------------------------------------------
with numbered as (
  select id,
         row_number() over (partition by event_id order by created_at, id) as n
  from registrations
)
update registrations r
set seq = numbered.n
from numbered
where numbered.id = r.id and r.seq is null;

-- Participants inherit their registration's number and take their position
-- within it (creation order, id as the tiebreaker so this is deterministic).
with numbered as (
  select p.id,
         r.seq as reg_seq,
         row_number() over (partition by p.registration_id order by p.created_at, p.id) as member_index
  from participants p
  join registrations r on r.id = p.registration_id
)
update participants p
set reg_seq = numbered.reg_seq,
    member_index = numbered.member_index
from numbered
where numbered.id = p.id and (p.reg_seq is null or p.member_index is null);

-- Snapshot the registrant's current profile onto existing rows. This is the
-- best available approximation for historic registrations — from here on the
-- value is captured at submission time.
update participants p
set profile_name = nullif(trim(coalesce(pr.full_name, '')), ''),
    profile_email = pr.email
from registrations r
join profiles pr on pr.id = r.registered_by
where r.id = p.registration_id
  and p.profile_name is null
  and p.profile_email is null;

-- ---------------------------------------------------------------------------
-- Constraints + indexes (safe now that every row is backfilled)
-- ---------------------------------------------------------------------------
alter table registrations alter column seq set not null;
alter table participants
  alter column reg_seq set not null,
  alter column member_index set not null;

-- One number per event. Also the guard that makes the read-max-then-insert in
-- submit_registration safe to rely on: if two submissions ever raced past the
-- event-row lock, the second would fail loudly rather than reuse a number.
create unique index if not exists registrations_event_seq_key
  on registrations (event_id, seq);

-- Backs the default "Reg. #" ordering of the console list.
create index if not exists participants_event_reg_no_idx
  on participants (event_id, reg_seq, member_index);

-- ---------------------------------------------------------------------------
-- submit_registration: assign the number + capture the profile snapshot.
-- Unchanged from 0023 apart from those additions and the now-unconditional
-- event-row lock (see the comment at the lock).
-- ---------------------------------------------------------------------------
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
  v_seq integer;
  v_member_index integer := 0;
  v_profile_name text;
  v_profile_email text;
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
  -- then the event row. The event lock used to be taken only when event-wide
  -- capacity applied; it is now unconditional because allocating the next
  -- per-event `seq` needs the same serialization (two submissions with
  -- disjoint participant types share no type row to lock behind).
  perform 1 from participant_types
    where id in (
      select distinct (x->>'participant_type_id')::uuid
      from jsonb_array_elements(p_participants) x
    )
    order by id
    for update;
  perform 1 from events where id = p_event_id for update;

  select coalesce(max(seq), 0) + 1 into v_seq
    from registrations where event_id = p_event_id;

  -- Snapshot of who submitted. full_name is nullable (magic-link sign-ins
  -- carry no name); the empty string is normalized away so the console can
  -- fall back to a placeholder.
  select nullif(trim(coalesce(full_name, '')), ''), email
    into v_profile_name, v_profile_email
    from profiles where id = v_uid;

  insert into registrations (event_id, registered_by, locale, seq)
  values (p_event_id, v_uid, coalesce(p_locale, 'en'), v_seq)
  returning id into v_registration_id;

  for v_p in select * from jsonb_array_elements(p_participants) loop
    v_member_index := v_member_index + 1;
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
      status, first_name, last_name, email, answers, waitlisted_at,
      reg_seq, member_index, profile_name, profile_email
    ) values (
      v_registration_id, p_event_id, v_type.id,
      (v_p->>'form_version_id')::uuid,
      v_status,
      trim(coalesce(v_p->>'first_name', '')), trim(coalesce(v_p->>'last_name', '')), nullif(trim(coalesce(v_p->>'email', '')), ''),
      coalesce(v_p->'answers', '{}'::jsonb),
      case when v_status = 'waitlisted' then now() end,
      v_seq, v_member_index, v_profile_name, v_profile_email
    ) returning id into v_new_id;

    v_results := v_results || jsonb_build_object(
      'participant_id', v_new_id,
      'first_name', trim(coalesce(v_p->>'first_name', '')),
      'reg_no', v_seq || '.' || v_member_index,
      'status', v_status
    );
  end loop;

  return jsonb_build_object(
    'registration_id', v_registration_id,
    'reg_seq', v_seq,
    'participants', v_results
  );
end;
$$;

-- Re-assert grants (create or replace preserves them, but be explicit).
revoke execute on function public.submit_registration(uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.submit_registration(uuid, text, jsonb, uuid) to service_role;
