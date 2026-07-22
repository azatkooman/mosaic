-- Centralize every organizer-driven participant status change. Direct table
-- updates could confirm a waitlisted participant after capacity was already
-- full, and could skip the waitlist promotion logic.

drop policy if exists participants_update on participants;
drop trigger if exists on_participant_cancelled on participants;

create or replace function public.transition_participant_status(
  p_participant_id uuid,
  p_new_status participant_status
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_participant participants%rowtype;
  v_event events%rowtype;
  v_confirmed_for_type integer;
  v_confirmed_for_event integer;
  v_candidate uuid;
  v_is_owner boolean;
  v_event_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Read the event id first, then use the same lock order as registration:
  -- all event type rows (by id), followed by the event row. This serializes
  -- status changes with registrations and prevents capacity races.
  select p.event_id, r.registered_by = auth.uid()
  into v_event_id, v_is_owner
  from participants p
  join registrations r on r.id = p.registration_id
  where p.id = p_participant_id;
  if v_event_id is null then
    raise exception 'participant not found';
  end if;
  if not private.can_checkin_event(v_event_id)
     and not (p_new_status = 'cancelled' and v_is_owner) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  perform 1
  from participant_types
  where event_id = v_event_id
  order by id
  for update;
  select * into v_event
  from events
  where id = v_event_id
  for update;
  select * into v_participant
  from participants
  where id = p_participant_id
  for update;

  if v_participant.status = p_new_status then
    raise exception 'participant already has this status';
  end if;
  if not (
    (v_participant.status = 'pending' and p_new_status in ('confirmed', 'waitlisted', 'cancelled'))
    or (v_participant.status = 'confirmed' and p_new_status = 'cancelled')
    or (v_participant.status = 'waitlisted' and p_new_status in ('confirmed', 'cancelled'))
    or (v_participant.status = 'cancelled' and p_new_status in ('confirmed', 'waitlisted'))
  ) then
    raise exception 'invalid participant status transition';
  end if;

  if p_new_status = 'confirmed' then
    select count(*) into v_confirmed_for_type
    from participants
    where participant_type_id = v_participant.participant_type_id
      and status = 'confirmed';
    select count(*) into v_confirmed_for_event
    from participants
    where event_id = v_participant.event_id
      and status = 'confirmed';

    if exists (
      select 1
      from participant_types pt
      where pt.id = v_participant.participant_type_id
        and pt.capacity is not null
        and v_confirmed_for_type >= pt.capacity
    ) or (v_event.capacity is not null and v_confirmed_for_event >= v_event.capacity) then
      raise exception 'cannot confirm participant: capacity is full';
    end if;
  end if;

  update participants
  set status = p_new_status,
      waitlisted_at = case when p_new_status = 'waitlisted' then now() else null end
  where id = v_participant.id;

  -- A confirmed cancellation frees one event seat. Promote the earliest
  -- waitlisted person in the event whose participant type also has a seat,
  -- rather than restricting promotion to the cancelled participant's type.
  if v_participant.status = 'confirmed' and p_new_status = 'cancelled' then
    select count(*) into v_confirmed_for_event
    from participants
    where event_id = v_participant.event_id
      and status = 'confirmed';

    if v_event.capacity is null or v_confirmed_for_event < v_event.capacity then
      select p.id into v_candidate
      from participants p
      join participant_types pt on pt.id = p.participant_type_id
      where p.event_id = v_participant.event_id
        and p.status = 'waitlisted'
        and (
          pt.capacity is null
          or (select count(*)
              from participants confirmed
              where confirmed.participant_type_id = p.participant_type_id
                and confirmed.status = 'confirmed') < pt.capacity
        )
      order by p.waitlisted_at asc nulls last, p.created_at asc
      limit 1
      for update of p skip locked;

      if v_candidate is not null then
        update participants
        set status = 'confirmed',
            waitlisted_at = null
        where id = v_candidate;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'participant_id', v_participant.id,
    'status', p_new_status,
    'promoted_participant_id', v_candidate
  );
end;
$$;

revoke execute on function public.transition_participant_status(uuid, participant_status) from public, anon;
grant execute on function public.transition_participant_status(uuid, participant_status) to authenticated;

-- Registrants retain the ability to cancel only their own participant. This
-- wrapper intentionally delegates to the same transition function, so it
-- shares its locks, transition rules, and waitlist promotion behavior.
create or replace function public.cancel_participant(p_participant_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.transition_participant_status(p_participant_id, 'cancelled');
end;
$$;
revoke execute on function public.cancel_participant(uuid) from public, anon;
grant execute on function public.cancel_participant(uuid) to authenticated;

-- The participant-status selector is a separate capability from editing
-- registration details. The transition RPC above remains authoritative.
create or replace function public.can_checkin_event_api(eid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select private.can_checkin_event(eid); $$;
revoke execute on function public.can_checkin_event_api(uuid) from public, anon;
grant execute on function public.can_checkin_event_api(uuid) to authenticated;
