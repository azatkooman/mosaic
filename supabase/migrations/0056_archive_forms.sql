-- Archiving a mode-scoped form: hidden from the console and from registrants,
-- kept in the database for admins.
--
-- "Archive", not "delete", and the distinction is the whole point — the rows
-- stay so an admin can still read them and so `participants.form_version_id`
-- (0001) keeps resolving. A participant records the exact version they
-- answered, and a registration from six months ago has to remain readable
-- after the form it was filled in on is gone from the organizer's screen.
-- Permanent deletion stays where 0036 put every other one: admin only.
--
-- Only the single and family forms can be archived. The default form is what
-- every participant type falls back to when no mode form applies, so archiving
-- it would leave an event that cannot be registered for at all — the RPC below
-- refuses it rather than the UI merely not offering it.
--
-- Deliberately not added: unarchiving. Re-adding a mode form creates a NEW form
-- and that is the documented behaviour the organizer asked for — a blank form
-- or a copy, not a resurrection. Restoring the old row instead would mean
-- deciding what happens to the questions it carried and to the version its
-- successor has already taken, without a screen asking for either.

alter table forms
  add column if not exists archived_at timestamptz;

comment on column forms.archived_at is
  'When this form was archived. Archived forms are hidden from the console and '
  'from registrants, and are readable only by admins; the rows stay so that '
  'participants.form_version_id keeps resolving.';

-- The unique index has to stop counting archived rows, and without this change
-- the feature does not work at all: 0014 made (event_id, registration_mode)
-- unique for every non-null mode, so archiving the single form and adding
-- another one would be rejected by the index rather than by any rule anyone
-- chose. Partial on archived_at, so an event may hold any number of archived
-- single forms and at most one live one.
drop index if exists forms_event_registration_mode_key;
create unique index forms_event_registration_mode_key
  on forms (event_id, registration_mode)
  where registration_mode is not null and archived_at is null;

-- Archiving is one operation and has to stay one: the flag and the participant
-- types that point at the form must move together, or a type is left aimed at a
-- form nobody can reach and its registrants get an error at the last step.
create or replace function public.archive_form(p_form_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_form forms%rowtype;
begin
  select * into v_form from forms where id = p_form_id;
  if not found then
    raise exception 'form not found';
  end if;

  -- Definer rights bypass RLS, so forms_update (0002) is re-asserted here.
  if not private.can_manage_event(v_form.event_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Enforced here rather than only in the console, because the console is not
  -- the only thing that can call this: PostgREST exposes it to any
  -- authenticated caller, and an event whose default form is gone cannot be
  -- registered for by anyone.
  if v_form.registration_mode is null then
    raise exception 'the default form cannot be archived';
  end if;

  if v_form.archived_at is not null then
    return;
  end if;

  update forms set archived_at = now() where id = p_form_id;

  -- A participant type may have been pointed at this form by hand (the
  -- Settings picker offers every form on the event). Left set, that type would
  -- resolve to a form the register page no longer loads.
  update participant_types set form_id = null where form_id = p_form_id;
end;
$$;

revoke execute on function public.archive_form(uuid) from public, anon;
grant execute on function public.archive_form(uuid) to authenticated;

-- submit_registration restated in full, because a PL/pgSQL body cannot be
-- patched a statement at a time. Identical to 0041 apart from one line in the
-- form-version check — `and f.archived_at is null` — which is what stops a
-- registrant who had the page open before the archive from submitting against
-- a form that is no longer offered. The register page not showing it is not
-- enough on its own: the version id travels from the client, and this is the
-- only write path (0002).
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
  if v_event.registration_manually_closed then
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
           and f.archived_at is null
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


-- Re-asserted for the same reason 0041 does it: `create or replace` preserves
-- grants, but leaving them implicit means the next person to read this has to
-- go back three migrations to learn that only the service role may call it.
revoke execute on function public.submit_registration(uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.submit_registration(uuid, text, jsonb, uuid) to service_role;
