-- Soft-delete (archive) participants.
--
-- Organizers with the delete-registrants privilege can remove a participant
-- from the console. "Remove" means archive, never erase: the row stays in the
-- database so a future admin tab can review — and only then permanently
-- delete — what was taken out. This mirrors how 0018 treats a published
-- event: hide it everywhere, keep the history.
--
-- 1. deleted_at / deleted_by on participants.
-- 2. RLS hides archived participants from EVERYONE except admins — including
--    the organizer who archived them and the registrant who owns them.
-- 3. Hard DELETE drops from the delete-registrants privilege to admins only.
--    Nothing in the app deletes participant rows today (delete_event does it
--    as a security-definer RPC, which bypasses RLS), so this closes a path
--    that would otherwise contradict "kept as archive history".
-- 4. transition_participant_status also accepts the delete-registrants
--    privilege for cancellations, since archiving cancels first.
-- 5. soft_delete_participants(uuid[]) — one call for a row button and for a
--    bulk selection.
-- 6. The dashboard counts view ignores archived rows.

alter table participants add column if not exists deleted_at timestamptz;
alter table participants add column if not exists deleted_by uuid references auth.users(id);

-- Every console list filters on this, so keep the live rows cheap to find.
create index if not exists participants_event_live
  on participants (event_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Archived rows are invisible to all but admins. The second half of the
-- predicate is 0002's original rule, unchanged.
drop policy if exists participants_select on participants;
create policy participants_select on participants for select to authenticated
  using (
    (deleted_at is null or private.is_admin())
    and (
      private.can_view_event(event_id)
      or exists (
        select 1 from registrations r
        where r.id = registration_id and r.registered_by = auth.uid()
      )
    )
  );

-- Permanent deletion is an admin power (the planned admin archive tab); an
-- event organizer archives instead.
drop policy if exists participants_delete on participants;
create policy participants_delete on participants for delete to authenticated
  using (private.is_admin());

-- Archiving must go through soft_delete_participants, which cancels first.
-- Without this, anyone holding check-in could PATCH the column straight over
-- PostgREST: setting it to archive a participant who is still confirmed (their
-- seat never released, the waitlist never promoted), or back to null to
-- un-archive a row they are no longer allowed to read. Nothing in the app
-- writes to participants directly — every path is an RPC, and those are
-- security definer, so they are unaffected.
drop policy if exists participants_update on participants;
create policy participants_update on participants for update to authenticated
  using (private.can_checkin_event(event_id) and deleted_at is null)
  with check (deleted_at is null);

-- ---------------------------------------------------------------------------
-- Status transitions: cancelling is also open to delete-registrants.
-- Recreated verbatim from 0020 apart from that one added clause.
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
  -- Cancelling is also open to the delete-registrants privilege: archiving a
  -- participant cancels them first, and that privilege must not depend on
  -- also holding check-in. Every other transition still requires check-in.
  if not private.can_checkin_event(v_event_id)
     and not (p_new_status = 'cancelled' and v_is_owner)
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

-- ---------------------------------------------------------------------------
-- Archive RPC
-- ---------------------------------------------------------------------------
-- Takes an array so the row button and the bulk selection share one path.
-- Each participant is cancelled first (through the authoritative transition
-- function, so capacity is released and the waitlist promotes exactly as a
-- normal cancellation would) and then stamped as archived.
--
-- Already-cancelled participants skip the transition: it rejects a no-op
-- status change, and archiving one must not fail because of that.
create or replace function public.soft_delete_participants(p_participant_ids uuid[])
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_event_id uuid;
  v_status participant_status;
  v_deleted_at timestamptz;
  v_archived uuid[] := '{}';
  v_promoted uuid[] := '{}';
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_participant_ids is null or array_length(p_participant_ids, 1) is null then
    raise exception 'no participants given';
  end if;
  if array_length(p_participant_ids, 1) > 500 then
    raise exception 'too many participants';
  end if;

  foreach v_id in array p_participant_ids loop
    select event_id, status, deleted_at
    into v_event_id, v_status, v_deleted_at
    from participants
    where id = v_id;

    if v_event_id is null then
      raise exception 'participant not found';
    end if;
    -- Checked per participant: an array may span events, and the privilege is
    -- granted per event.
    if not private.can_delete_registrants(v_event_id) then
      raise exception 'not allowed' using errcode = '42501';
    end if;

    -- Already archived — nothing to do, and re-stamping would rewrite who did
    -- it and when.
    continue when v_deleted_at is not null;

    if v_status <> 'cancelled' then
      v_result := public.transition_participant_status(v_id, 'cancelled');
      -- The key is always present (jsonb_build_object), so a null test is
      -- enough — and avoids the jsonb `?` operator, which some clients treat
      -- as a bind placeholder.
      if v_result->>'promoted_participant_id' is not null then
        v_promoted := v_promoted || (v_result->>'promoted_participant_id')::uuid;
      end if;
    end if;

    update participants
    set deleted_at = now(), deleted_by = auth.uid()
    where id = v_id;

    v_archived := v_archived || v_id;
  end loop;

  return jsonb_build_object(
    'archived', to_jsonb(v_archived),
    'archived_count', coalesce(array_length(v_archived, 1), 0),
    'promoted', to_jsonb(v_promoted)
  );
end;
$$;
revoke execute on function public.soft_delete_participants(uuid[]) from public, anon;
grant execute on function public.soft_delete_participants(uuid[]) to authenticated;

-- UX gate for the delete button; the RPC above re-checks authoritatively.
create or replace function public.can_delete_registrants_api(eid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select private.can_delete_registrants(eid); $$;
revoke execute on function public.can_delete_registrants_api(uuid) from public, anon;
grant execute on function public.can_delete_registrants_api(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard counts must agree with the participants list, which hides
-- archived rows. security_invoker keeps RLS applying to the caller, so this
-- only changes what an ADMIN sees — everyone else already cannot read them.
-- ---------------------------------------------------------------------------
create or replace view event_participant_counts
with (security_invoker = true) as
select event_id, participant_type_id, status, count(*)::integer as n
from participants
where deleted_at is null
group by 1, 2, 3;
