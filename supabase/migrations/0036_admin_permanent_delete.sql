-- Permanent deletion for the admin console's Archived Events section.
--
-- Everything else in this app soft-deletes: `delete_event` archives a
-- published event, `soft_delete_participants` archives a registration. These
-- two functions are the other end of that — the point where data actually
-- leaves the database and cannot be recovered. Nothing else in the app calls
-- them, and only admins may.
--
-- Eligibility, per the product rule that deletion is rare and deliberate:
--
--   participants  archived event  → any status may be purged
--                 live event      → only a CANCELLED registration may be
--                                   purged (the same precondition 0035 put on
--                                   archiving: purge is not a shortcut past
--                                   cancelling)
--   events        archived        → may be purged
--                 not archived    → only once it has ENDED; a running or
--                                   upcoming event is never purgeable
--
-- Both are checked here, not only in the console, so the rules hold whatever
-- calls them.
--
-- Known limitation, deliberately not solved here: file answers point at
-- objects in the `registration-files` storage bucket, and cover images at
-- `event-covers`. SQL cannot reach storage, so purging leaves those objects
-- orphaned. Reclaiming them needs a storage-side sweep.

-- ---------------------------------------------------------------------------
-- Participants
-- ---------------------------------------------------------------------------
create or replace function public.purge_participants(p_participant_ids uuid[])
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_status participant_status;
  v_event_archived boolean;
  v_registration_id uuid;
  v_purged uuid[] := '{}';
  v_registrations uuid[] := '{}';
  v_empty uuid[] := '{}';
  v_reg uuid;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_participant_ids is null or array_length(p_participant_ids, 1) is null then
    raise exception 'no participants given';
  end if;
  if array_length(p_participant_ids, 1) > 500 then
    raise exception 'too many participants';
  end if;

  foreach v_id in array p_participant_ids loop
    select p.status, p.registration_id, e.deleted_at is not null
    into v_status, v_registration_id, v_event_archived
    from participants p
    join events e on e.id = p.event_id
    where p.id = v_id
    for update of p;

    if v_registration_id is null then
      raise exception 'participant not found';
    end if;

    -- On a live event, purging is only ever the last step after cancelling.
    -- On an archived event the whole record is already out of circulation, so
    -- there is nothing left for the status to protect.
    if not v_event_archived and v_status <> 'cancelled' then
      raise exception 'participant must be cancelled before it can be deleted';
    end if;

    -- participant_status_history cascades from participants; nothing else
    -- references a participant row.
    delete from participants where id = v_id;

    v_purged := v_purged || v_id;
    if not (v_registration_id = any (v_registrations)) then
      v_registrations := v_registrations || v_registration_id;
    end if;
  end loop;

  -- A registration that has lost every participant is invisible dead weight —
  -- nothing renders it and nothing can reach it. Clear it out rather than
  -- leaving orphans behind a function whose whole promise is that the data is
  -- gone. Registrations that still hold participants are untouched.
  foreach v_reg in array v_registrations loop
    if not exists (select 1 from participants where registration_id = v_reg) then
      delete from registrations where id = v_reg;
      v_empty := v_empty || v_reg;
    end if;
  end loop;

  return jsonb_build_object(
    'purged', to_jsonb(v_purged),
    'purged_count', coalesce(array_length(v_purged, 1), 0),
    'registrations_removed', coalesce(array_length(v_empty, 1), 0)
  );
end;
$$;
revoke execute on function public.purge_participants(uuid[]) from public, anon;
grant execute on function public.purge_participants(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create or replace function public.purge_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_event events%rowtype;
  v_participants integer;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_event from events where id = p_event_id for update;
  if not found then
    raise exception 'event not found';
  end if;

  -- Archived events are already out of circulation. A live one must at least
  -- be over: purging an event mid-registration would delete registrations out
  -- from under people who are still counting on them.
  if v_event.deleted_at is null and (v_event.ends_at is null or v_event.ends_at > now()) then
    raise exception 'event must be archived or ended before it can be deleted';
  end if;

  select count(*) into v_participants from participants where event_id = p_event_id;

  -- Deepest first, in the order delete_event already proved out for
  -- never-published events: participants.event_id / participant_type_id /
  -- form_version_id carry no ON DELETE rule, and participant_types references
  -- forms, so nothing here can lean on cascades alone. forms cascade to
  -- form_versions; events cascade to registrations, event_organizers and
  -- event_roles.
  delete from participants where event_id = p_event_id;
  delete from registrations where event_id = p_event_id;
  delete from participant_types where event_id = p_event_id;
  delete from forms where event_id = p_event_id;
  delete from events where id = p_event_id;

  return jsonb_build_object('event_id', p_event_id, 'participants_removed', v_participants);
end;
$$;
revoke execute on function public.purge_event(uuid) from public, anon;
grant execute on function public.purge_event(uuid) to authenticated;
