-- Archiving becomes the second step of an explicit two-step flow.
--
-- A red "Delete" sitting beside the status control read as a synonym for
-- cancelling: both remove someone from the event, and nothing said which to
-- reach for. Requiring the participant to ALREADY be cancelled turns the two
-- into a sequence — cancel, then archive — so they can no longer be mistaken
-- for alternatives. Cancelling stays the ordinary, reversible act; archiving is
-- the rare follow-up that hides the record.
--
-- Enforced here rather than only in the console, so it is a real guarantee.
--
-- Consequences of the precondition:
--   * The function no longer cancels anything, so it no longer calls
--     transition_participant_status and can no longer promote from the
--     waitlist — the organizer's own cancellation already did both. The
--     returned 'promoted' key is therefore gone; no caller read it.
--   * 0033's widening of transition_participant_status (cancelling is open to
--     delete-registrants, not just check-in) is KEPT and now matters more: it
--     is what lets a delete-registrants holder perform the required first step.
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
    -- Locked for the duration: without this a concurrent status change could
    -- move the row off 'cancelled' between the check below and the update.
    select event_id, status, deleted_at
    into v_event_id, v_status, v_deleted_at
    from participants
    where id = v_id
    for update;

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

    -- The precondition. Raising aborts the whole call, so a bulk archive is
    -- all-or-nothing: the organizer never has to work out which half of a
    -- selection went through.
    if v_status <> 'cancelled' then
      raise exception 'participant must be cancelled before archiving';
    end if;

    update participants
    set deleted_at = now(), deleted_by = auth.uid()
    where id = v_id;

    v_archived := v_archived || v_id;
  end loop;

  return jsonb_build_object(
    'archived', to_jsonb(v_archived),
    'archived_count', coalesce(array_length(v_archived, 1), 0)
  );
end;
$$;
revoke execute on function public.soft_delete_participants(uuid[]) from public, anon;
grant execute on function public.soft_delete_participants(uuid[]) to authenticated;
