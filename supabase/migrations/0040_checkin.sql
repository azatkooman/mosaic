-- On-site check-in.
--
-- Attendance is deliberately NOT a participant_status: the registration
-- lifecycle (pending/confirmed/waitlisted/cancelled, with its enforced
-- transitions) and physical arrival are different state machines. A timestamp
-- plus the operator gives duplicate-scan detection, undo and an audit trail;
-- the UI can still present it as a checkbox.
--
-- Each participant gets an opaque ticket_code — what the QR encodes — instead
-- of exposing the row's primary key. Codes are 20 hex chars (80 random bits),
-- derived from gen_random_uuid so no extension dependency is needed, and can
-- be rotated later without touching identities.

alter table participants
  add column if not exists ticket_code text
    not null
    default substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20),
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid references auth.users(id);

create unique index if not exists participants_ticket_code on participants (ticket_code);
-- Covering index for the new FK (keeps the performance advisor clean).
create index if not exists participants_checked_in_by on participants (checked_in_by);

-- The scanner's single write path. Validates the caller's check-in privilege
-- for the ticket's event, then applies the scan rules:
--   ok        checked in now
--   already   was checked in before (returns when/by whom — shown as warning)
--   rejected  registration is not 'confirmed' (returns the status)
--   not_found no live ticket with that code, or no privilege for its event
--             (indistinguishable on purpose — a code must not be an oracle).
create or replace function public.check_in_participant(p_ticket_code text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  p record;
  v_by text;
begin
  select pt.id, pt.event_id, pt.status, pt.checked_in_at, pt.checked_in_by,
         pt.first_name, pt.last_name, pt.reg_seq, pt.member_index,
         ty.name as type_name
    into p
    from participants pt
    left join participant_types ty on ty.id = pt.participant_type_id
   where pt.ticket_code = p_ticket_code
     and pt.deleted_at is null;

  if p.id is null or not private.can_checkin_event(p.event_id) then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if p.checked_in_at is not null then
    select full_name into v_by from profiles where id = p.checked_in_by;
    return jsonb_build_object(
      'outcome', 'already',
      'first_name', p.first_name, 'last_name', p.last_name,
      'type_name', p.type_name,
      'reg_no', p.reg_seq || '.' || p.member_index,
      'checked_in_at', p.checked_in_at,
      'checked_in_by', v_by
    );
  end if;

  if p.status <> 'confirmed' then
    return jsonb_build_object(
      'outcome', 'rejected',
      'first_name', p.first_name, 'last_name', p.last_name,
      'type_name', p.type_name,
      'reg_no', p.reg_seq || '.' || p.member_index,
      'status', p.status
    );
  end if;

  update participants
     set checked_in_at = now(), checked_in_by = auth.uid()
   where id = p.id;

  return jsonb_build_object(
    'outcome', 'ok',
    'first_name', p.first_name, 'last_name', p.last_name,
    'type_name', p.type_name,
    'reg_no', p.reg_seq || '.' || p.member_index,
    'checked_in_at', now()
  );
end;
$$;
revoke execute on function public.check_in_participant(text) from public, anon;
grant execute on function public.check_in_participant(text) to authenticated;

-- Manual toggle from the participants table (phone died, paper list, undo a
-- mistaken scan). Same privilege, same confirmed-only rule for checking IN;
-- clearing is always allowed to whoever holds the privilege.
create or replace function public.set_participant_checkin(p_participant_id uuid, p_checked_in boolean)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  p record;
begin
  select id, event_id, status, deleted_at into p
    from participants where id = p_participant_id;

  if p.id is null or p.deleted_at is not null then
    raise exception 'participant not found';
  end if;
  if not private.can_checkin_event(p.event_id) then
    raise exception 'not allowed';
  end if;

  if p_checked_in then
    if p.status <> 'confirmed' then
      raise exception 'only confirmed participants can be checked in';
    end if;
    update participants
       set checked_in_at = coalesce(checked_in_at, now()),
           checked_in_by = coalesce(checked_in_by, auth.uid())
     where id = p.id;
  else
    update participants
       set checked_in_at = null, checked_in_by = null
     where id = p.id;
  end if;

  return (select jsonb_build_object('checked_in_at', checked_in_at)
            from participants where id = p.id);
end;
$$;
revoke execute on function public.set_participant_checkin(uuid, boolean) from public, anon;
grant execute on function public.set_participant_checkin(uuid, boolean) to authenticated;

-- Read side of a scanned URL: the /t/<code> landing page shows the ticket to
-- staff with the check-in privilege and a generic page to everyone else.
-- Returns null both for unknown codes and missing privilege.
create or replace function public.ticket_info(p_ticket_code text)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  p record;
begin
  select pt.id, pt.event_id, pt.status, pt.checked_in_at,
         pt.first_name, pt.last_name, pt.reg_seq, pt.member_index,
         ty.name as type_name, ev.name as event_name
    into p
    from participants pt
    join events ev on ev.id = pt.event_id
    left join participant_types ty on ty.id = pt.participant_type_id
   where pt.ticket_code = p_ticket_code
     and pt.deleted_at is null;

  if p.id is null or not private.can_checkin_event(p.event_id) then
    return null;
  end if;

  return jsonb_build_object(
    'participant_id', p.id,
    'event_id', p.event_id,
    'event_name', p.event_name,
    'first_name', p.first_name, 'last_name', p.last_name,
    'type_name', p.type_name,
    'reg_no', p.reg_seq || '.' || p.member_index,
    'status', p.status,
    'checked_in_at', p.checked_in_at
  );
end;
$$;
revoke execute on function public.ticket_info(text) from public, anon;
grant execute on function public.ticket_info(text) to authenticated;
