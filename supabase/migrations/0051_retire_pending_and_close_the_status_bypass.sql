-- Three things about participant status, found by tracing where each value in
-- the enum actually comes from.
--
-- 1. 'pending' is unreachable. submit_registration (0031) assigns only
--    'confirmed' or 'waitlisted', and no transition has ever targeted
--    'pending', so nothing can produce one — the audit trail confirms it: all
--    32 rows on production were created straight into 'confirmed', and neither
--    database holds a single pending participant. It survived as the column
--    DEFAULT and as an option in the console's status filter, where it could
--    only ever return nothing. The filter option goes in the app; here the
--    default goes, so no future writer can manufacture one by omission, and
--    the transition matrix stops naming it.
--
--    The enum VALUE stays: Postgres cannot drop one, and a value nothing writes
--    costs nothing. The console keeps its `status.pending` label for the same
--    reason — cheap insurance against a hand-edited or restored row rendering
--    a missing translation key.
--
-- 2. participants_update let any check-in role rewrite a participant row
--    directly over PostgREST — including `status`, skipping the matrix below,
--    the capacity check, and waitlist promotion. 0033 added it to stop
--    `deleted_at` being PATCHed, and its own comment records the reason the
--    policy is not needed at all: "Nothing in the app writes to participants
--    directly — every path is an RPC, and those are security definer, so they
--    are unaffected." Verified still true — there is no .update() against
--    participants anywhere in the codebase — so the policy is dropped rather
--    than narrowed. With no UPDATE policy, PostgREST can write nothing, and
--    every real path continues to work because it runs as definer.
--
-- 3. 'confirmed' could only become 'cancelled'. An organizer wanting to move
--    someone to the waitlist had to cancel them first — which immediately
--    promotes the longest-waiting person into the seat, so the seat they were
--    trying to reassign was gone before they could act. confirmed → waitlisted
--    is now a transition of its own.
--
--    It deliberately does NOT promote. Promotion exists so a seat given up
--    keeps circulating; this transition is an organizer taking a seat back on
--    purpose, and handing it straight to the next in line would defeat the only
--    reason to use it. Cancelling still promotes, unchanged. The demoted
--    participant joins the BACK of the queue — waitlisted_at is set to now() by
--    the update below, which is what the existing waitlisting path already does.

-- ---------------------------------------------------------------------------
-- 1. No default: submit_registration always states the status, and NOT NULL
--    now makes any future writer that forgets fail loudly instead of quietly
--    creating a row in a status the product does not use.
-- ---------------------------------------------------------------------------
alter table public.participants alter column status drop default;

-- ---------------------------------------------------------------------------
-- 2. Close the direct-write bypass.
-- ---------------------------------------------------------------------------
drop policy if exists participants_update on participants;

-- ---------------------------------------------------------------------------
-- 3. Transitions. Recreated verbatim from 0046 apart from the matrix and the
--    promotion condition.
-- ---------------------------------------------------------------------------
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
  -- be running (see 0046).
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
  -- 'pending' no longer appears: nothing can be in it, so nothing can leave it,
  -- and it is not a destination anyone should be able to choose.
  if not (
    (v_participant.status = 'confirmed' and p_new_status in ('cancelled', 'waitlisted'))
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

  -- A confirmed CANCELLATION frees one event seat. Promote the earliest
  -- waitlisted person in the event whose participant type also has a seat,
  -- rather than restricting promotion to the cancelled participant's type.
  --
  -- confirmed → waitlisted is excluded on purpose: see the header. The seat it
  -- frees is meant to stay free for the organizer to assign.
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
