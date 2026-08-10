-- A registrant may cancel their own participant only while the event is still
-- ahead of them.
--
-- Once an event has finished, its participant list stops being a plan and
-- becomes a record of what happened: who was expected, who was checked in.
-- Letting an attendee flip a row to 'cancelled' weeks later edits that record,
-- and 0040's check-in timestamps made the cost concrete — a cancelled
-- participant carrying a checked_in_at is a contradiction the console has no
-- way to explain. Correcting attendance after the fact is the organizer's job,
-- so it now requires an organizer privilege like every other post-event edit.
--
-- Archived events are covered by the same clause for a different reason: the
-- registrant cannot even see the event (events_select_public requires
-- 'published'), so the My Registrations card shows "Event unavailable" — a
-- cancellation aimed at an event whose dates and name are hidden is not a
-- decision anyone can make informedly.
--
-- Deliberately NOT restricted: private.can_checkin_event (organizers, and
-- admins via is_admin()'s short-circuit in has_event_privilege) and
-- private.can_delete_registrants. They are precisely who should still be able
-- to, and archiving a participant cancels them first — gating that on the
-- event's dates would break admin cleanup of old events.
--
-- Recreated verbatim from 0033 apart from v_event_over: its declaration, the
-- join that computes it, and the one added clause.

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
  v_event_over boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Read the event id first, then use the same lock order as registration:
  -- all event type rows (by id), followed by the event row. This serializes
  -- status changes with registrations and prevents capacity races.
  --
  -- The events join reads only what the owner check below needs. The row is
  -- read again (locked) further down; this early read is not a substitute for
  -- that one, and must not be used for anything that a concurrent write could
  -- change underneath it. Whether an event has ended is a function of the
  -- clock, not of a racing transaction.
  select p.event_id, r.registered_by = auth.uid(),
         e.status = 'archived' or (e.ends_at is not null and now() > e.ends_at)
  into v_event_id, v_is_owner, v_event_over
  from participants p
  join registrations r on r.id = p.registration_id
  join events e on e.id = p.event_id
  where p.id = p_participant_id;
  if v_event_id is null then
    raise exception 'participant not found';
  end if;
  -- Cancelling is also open to the delete-registrants privilege: archiving a
  -- participant cancels them first, and that privilege must not depend on
  -- also holding check-in. Every other transition still requires check-in.
  -- The owner's self-service branch additionally requires the event to still
  -- be running (see the header).
  if not private.can_checkin_event(v_event_id)
     and not (p_new_status = 'cancelled' and v_is_owner and not v_event_over)
     and not (p_new_status = 'cancelled'
              and private.can_delete_registrants(v_event_id)) then
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
